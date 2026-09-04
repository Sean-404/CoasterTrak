import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";
import {
  isRideDateISO,
  parseRideQuantity,
  sortRideDayLogs,
  summarizeRideEvents,
  type RideCreditSummary,
  type RideDayLog,
} from "@/lib/ride-history";

type LogRideEventsRow = {
  coaster_id: number;
  total_rides: number;
  first_ridden_on: string | null;
  last_ridden_on: string | null;
};

export type LogRideResult =
  | { ok: true; summary: RideCreditSummary }
  | { ok: false; message: string };

export function friendlyLogError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("not authenticated")) return "Sign in to track rides.";
  if (
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("could not find the function")
  ) {
    return "Ride history is not available yet. Apply the latest database update and try again.";
  }
  if (lower.includes("too many rides")) {
    return "That's a lot of rides for this coaster on this date. Try a smaller number.";
  }
  if (
    lower.includes("quantity must be") ||
    lower.includes("ride_events_quantity_range") ||
    (lower.includes("between 1 and 99") && lower.includes("quantity"))
  ) {
    return "Enter a whole number of rides between 1 and 99.";
  }
  if (
    lower.includes("ridden_on is required") ||
    lower.includes("invalid input syntax for type date")
  ) {
    return "Pick a valid ride date.";
  }
  if (lower.includes("no rides logged for this date")) {
    return "No rides logged for that day.";
  }
  return message || "Could not log ride. Please try again.";
}

function isMissingRideHistoryApi(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("schema cache") ||
    lower.includes("could not find the function") ||
    (lower.includes("does not exist") &&
      (lower.includes("log_ride_events") || lower.includes("adjust_ride_events")))
  );
}

function isUniqueViolation(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("duplicate key") || lower.includes("unique constraint") || lower.includes("23505");
}

function isAmbiguousColumn(message: string): boolean {
  return message.toLowerCase().includes("ambiguous");
}

type EventQtyRow = {
  id: number;
  quantity: number | null;
  ridden_on: string | null;
};

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function readCoasterSummary(
  supabase: SupabaseClient,
  userId: string,
  coasterId: number,
  fallback: { quantity: number; riddenOn: string | null },
): Promise<RideCreditSummary> {
  const summary = await readRemainingSummary(supabase, userId, coasterId);
  if (summary) return summary;
  return {
    coasterId,
    totalRides: fallback.quantity,
    firstRiddenOn: fallback.riddenOn,
    lastRiddenOn: fallback.riddenOn,
  };
}

async function readRemainingSummary(
  supabase: SupabaseClient,
  userId: string,
  coasterId: number,
): Promise<RideCreditSummary | null> {
  const { data } = await supabase
    .from("ride_events")
    .select("id, quantity, ridden_on")
    .eq("user_id", userId)
    .eq("coaster_id", coasterId);

  const summary = summarizeRideEvents(
    ((data ?? []) as EventQtyRow[]).map((row) => ({
      userId,
      coasterId,
      riddenOn: row.ridden_on,
      quantity: Number(row.quantity) || 0,
    })),
  ).byCoaster.get(coasterId);
  return summary ?? null;
}

async function logRideEventsDirect(
  supabase: SupabaseClient,
  input: { coasterId: number; riddenOn: string; quantity: number },
): Promise<LogRideResult> {
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, message: "Sign in to track rides." };

  const { error: creditError } = await supabase.from("rides").upsert(
    { user_id: userId, coaster_id: input.coasterId },
    { onConflict: "user_id,coaster_id", ignoreDuplicates: true },
  );
  if (creditError) return { ok: false, message: friendlyLogError(creditError.message) };

  const { data: existing, error: existingError } = await supabase
    .from("ride_events")
    .select("id, quantity, ridden_on")
    .eq("user_id", userId)
    .eq("coaster_id", input.coasterId)
    .eq("ridden_on", input.riddenOn)
    .maybeSingle();

  if (existingError && !/no rows|pgrst116/i.test(existingError.message)) {
    return { ok: false, message: friendlyLogError(existingError.message) };
  }

  if (existing?.id) {
    const next = (Number(existing.quantity) || 0) + input.quantity;
    if (next > 99) {
      return {
        ok: false,
        message: "That's a lot of rides for this coaster on this date. Try a smaller number.",
      };
    }
    const { error: updateError } = await supabase
      .from("ride_events")
      .update({ quantity: next })
      .eq("id", existing.id);
    if (updateError) return { ok: false, message: friendlyLogError(updateError.message) };
  } else {
    const { error: insertError } = await supabase.from("ride_events").insert({
      user_id: userId,
      coaster_id: input.coasterId,
      ridden_on: input.riddenOn,
      quantity: input.quantity,
      source: "user_log",
    });
    if (insertError) {
      if (!isUniqueViolation(insertError.message)) {
        return { ok: false, message: friendlyLogError(insertError.message) };
      }
      const { data: raced } = await supabase
        .from("ride_events")
        .select("id, quantity")
        .eq("user_id", userId)
        .eq("coaster_id", input.coasterId)
        .eq("ridden_on", input.riddenOn)
        .maybeSingle();
      if (!raced?.id) return { ok: false, message: friendlyLogError(insertError.message) };
      const next = (Number(raced.quantity) || 0) + input.quantity;
      const { error: updateError } = await supabase
        .from("ride_events")
        .update({ quantity: next })
        .eq("id", raced.id);
      if (updateError) return { ok: false, message: friendlyLogError(updateError.message) };
    }
  }

  await supabase
    .from("ride_events")
    .delete()
    .eq("user_id", userId)
    .eq("coaster_id", input.coasterId)
    .is("ridden_on", null);

  await supabase.from("wishlist").delete().eq("user_id", userId).eq("coaster_id", input.coasterId);

  return {
    ok: true,
    summary: await readCoasterSummary(supabase, userId, input.coasterId, {
      quantity: input.quantity,
      riddenOn: input.riddenOn,
    }),
  };
}

/** First credit / wishlist mark — no ride day, so Month Wrapped stays quiet until a date is logged. */
async function logUndatedCredit(
  supabase: SupabaseClient,
  input: { coasterId: number; quantity: number },
): Promise<LogRideResult> {
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, message: "Sign in to track rides." };

  const { error: creditError } = await supabase.from("rides").upsert(
    { user_id: userId, coaster_id: input.coasterId },
    { onConflict: "user_id,coaster_id", ignoreDuplicates: true },
  );
  if (creditError) return { ok: false, message: friendlyLogError(creditError.message) };

  const existingSummary = await readRemainingSummary(supabase, userId, input.coasterId);
  // Already has history (dated or undated) — don't invent a second placeholder.
  if (existingSummary) {
    await supabase.from("wishlist").delete().eq("user_id", userId).eq("coaster_id", input.coasterId);
    return { ok: true, summary: existingSummary };
  }

  const { error: insertError } = await supabase.from("ride_events").insert({
    user_id: userId,
    coaster_id: input.coasterId,
    ridden_on: null,
    quantity: input.quantity,
    source: "legacy_credit",
  });
  if (insertError) return { ok: false, message: friendlyLogError(insertError.message) };

  await supabase.from("wishlist").delete().eq("user_id", userId).eq("coaster_id", input.coasterId);

  return {
    ok: true,
    summary: await readCoasterSummary(supabase, userId, input.coasterId, {
      quantity: input.quantity,
      riddenOn: null,
    }),
  };
}

export async function logRideEvents(
  supabase: SupabaseClient,
  input: { coasterId: number; riddenOn?: string | null; quantity?: number },
): Promise<LogRideResult> {
  const quantity = parseRideQuantity(input.quantity ?? 1);
  if (quantity == null) {
    return { ok: false, message: "Enter a whole number of rides between 1 and 99." };
  }

  // Omitting a date creates an undated credit. Only explicit dates enter Month Wrapped / trip history.
  if (input.riddenOn == null || input.riddenOn === "") {
    return logUndatedCredit(supabase, { coasterId: input.coasterId, quantity });
  }

  const riddenOn = input.riddenOn;
  if (!isRideDateISO(riddenOn)) {
    return { ok: false, message: "Pick a valid ride date." };
  }

  const { data, error } = await supabase.rpc("log_ride_events", {
    p_coaster_id: input.coasterId,
    p_ridden_on: riddenOn,
    p_quantity: quantity,
  });

  if (error) {
    if (
      isMissingRideHistoryApi(error.message) ||
      isUniqueViolation(error.message) ||
      isAmbiguousColumn(error.message)
    ) {
      return logRideEventsDirect(supabase, { coasterId: input.coasterId, riddenOn, quantity });
    }
    return { ok: false, message: friendlyLogError(error.message) };
  }

  const raw = Array.isArray(data) ? data[0] : data;
  let row: LogRideEventsRow | null = null;
  try {
    row = (
      typeof raw === "string" ? (JSON.parse(raw) as LogRideEventsRow) : (raw as LogRideEventsRow | null)
    );
  } catch {
    row = null;
  }
  if (row && Number(row.total_rides) > 0) {
    return {
      ok: true,
      summary: {
        coasterId: Number(row.coaster_id) || input.coasterId,
        totalRides: Number(row.total_rides),
        firstRiddenOn: row.first_ridden_on ?? riddenOn,
        lastRiddenOn: row.last_ridden_on ?? riddenOn,
      },
    };
  }

  const userId = await currentUserId(supabase);
  if (userId) {
    const summary = await readCoasterSummary(supabase, userId, input.coasterId, {
      quantity,
      riddenOn,
    });
    if (summary.totalRides > 0) return { ok: true, summary };
  }

  return logRideEventsDirect(supabase, { coasterId: input.coasterId, riddenOn, quantity });
}

type SummaryRow = {
  coaster_id: number;
  total_rides: number | null;
  first_ridden_on: string | null;
  last_ridden_on: string | null;
};

export async function loadRideCreditSummaries(
  supabase: SupabaseClient,
  userIds: string | string[],
): Promise<{ summaries: RideCreditSummary[]; byUser: Map<string, RideCreditSummary[]>; error: string | null }> {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) {
    return { summaries: [], byUser: new Map(), error: null };
  }

  const { data, error } = await fetchAllPages<SummaryRow & { user_id: string }>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("ride_credit_summaries")
        .select("user_id, coaster_id, total_rides, first_ridden_on, last_ridden_on")
        .in("user_id", ids)
        .order("user_id", { ascending: true })
        .order("coaster_id", { ascending: true })
        .range(from, to),
  );

  if (error) {
    return { summaries: [], byUser: new Map(), error: error.message };
  }

  const byUser = new Map<string, RideCreditSummary[]>();
  const summaries: RideCreditSummary[] = [];
  for (const row of data) {
    const summary: RideCreditSummary = {
      coasterId: row.coaster_id,
      totalRides: Math.max(1, Number(row.total_rides) || 1),
      firstRiddenOn: row.first_ridden_on ?? null,
      lastRiddenOn: row.last_ridden_on ?? null,
    };
    summaries.push(summary);
    const list = byUser.get(row.user_id) ?? [];
    list.push(summary);
    byUser.set(row.user_id, list);
  }

  return { summaries, byUser, error: null };
}

export async function loadDatedRideEventsInRange(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{
  events: Array<{ coasterId: number; riddenOn: string; quantity: number }>;
  error: string | null;
}> {
  if (!isRideDateISO(startDate) || !isRideDateISO(endDate)) {
    return { events: [], error: "Invalid date range." };
  }

  type Row = { coaster_id: number; ridden_on: string | null; quantity: number | null };
  const { data, error } = await fetchAllPages<Row>(SUPABASE_PAGE_SIZE, (from, to) =>
    supabase
      .from("ride_events")
      .select("coaster_id, ridden_on, quantity")
      .eq("user_id", userId)
      .not("ridden_on", "is", null)
      .gte("ridden_on", startDate)
      .lte("ridden_on", endDate)
      .order("ridden_on", { ascending: true })
      .order("coaster_id", { ascending: true })
      .range(from, to),
  );

  if (error) return { events: [], error: error.message };

  const events = data
    .filter((row): row is Row & { ridden_on: string } => isRideDateISO(row.ridden_on))
    .map((row) => ({
      coasterId: row.coaster_id,
      riddenOn: row.ridden_on,
      quantity: Math.max(1, Number(row.quantity) || 1),
    }));

  return { events, error: null };
}

export function summariesByCoasterId(summaries: RideCreditSummary[]): Map<number, RideCreditSummary> {
  const map = new Map<number, RideCreditSummary>();
  for (const summary of summaries) map.set(summary.coasterId, summary);
  return map;
}

type AdjustRideEventsRow = LogRideEventsRow & { credit_removed?: boolean };

export type AdjustRideResult =
  | { ok: true; summary: RideCreditSummary | null }
  | { ok: false; message: string };

type EventListRow = {
  id: number;
  ridden_on: string | null;
  quantity: number | null;
};

export async function loadRideEventsForCoaster(
  supabase: SupabaseClient,
  userId: string,
  coasterId: number,
): Promise<{ days: RideDayLog[]; error: string | null }> {
  const { data, error } = await supabase
    .from("ride_events")
    .select("id, ridden_on, quantity")
    .eq("user_id", userId)
    .eq("coaster_id", coasterId);

  if (error) return { days: [], error: friendlyLogError(error.message) };

  const days = sortRideDayLogs(
    ((data ?? []) as EventListRow[])
      .map((row) => ({
        id: row.id,
        riddenOn: row.ridden_on && isRideDateISO(row.ridden_on) ? row.ridden_on : null,
        quantity: Number(row.quantity) || 0,
      }))
      .filter((row) => row.quantity >= 1),
  );
  const hasDated = days.some((row) => row.riddenOn != null);
  return { days: hasDated ? days.filter((row) => row.riddenOn != null) : days, error: null };
}

async function adjustRideEventsDirect(
  supabase: SupabaseClient,
  input: { coasterId: number; riddenOn: string | null; quantity: number },
): Promise<AdjustRideResult> {
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, message: "Sign in to track rides." };

  let query = supabase
    .from("ride_events")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("coaster_id", input.coasterId);
  query = input.riddenOn == null ? query.is("ridden_on", null) : query.eq("ridden_on", input.riddenOn);

  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError && !/no rows|pgrst116/i.test(existingError.message)) {
    return { ok: false, message: friendlyLogError(existingError.message) };
  }
  if (!existing?.id) return { ok: false, message: "No rides logged for that day." };

  const current = Number(existing.quantity) || 0;
  if (input.quantity >= current) {
    const { error: deleteError } = await supabase.from("ride_events").delete().eq("id", existing.id);
    if (deleteError) return { ok: false, message: friendlyLogError(deleteError.message) };
  } else {
    const { error: updateError } = await supabase
      .from("ride_events")
      .update({ quantity: current - input.quantity })
      .eq("id", existing.id);
    if (updateError) return { ok: false, message: friendlyLogError(updateError.message) };
  }

  const summary = await readRemainingSummary(supabase, userId, input.coasterId);
  if (!summary) {
    const { error: creditError } = await supabase
      .from("rides")
      .delete()
      .eq("user_id", userId)
      .eq("coaster_id", input.coasterId);
    if (creditError) return { ok: false, message: friendlyLogError(creditError.message) };
    return { ok: true, summary: null };
  }
  return { ok: true, summary };
}

function parseRpcJson<T>(data: unknown): T | null {
  const raw = Array.isArray(data) ? data[0] : data;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T | null;
  } catch {
    return null;
  }
}

export async function adjustRideEvents(
  supabase: SupabaseClient,
  input: { coasterId: number; riddenOn: string | null; quantity?: number },
): Promise<AdjustRideResult> {
  const quantity = parseRideQuantity(input.quantity ?? 1);
  if (quantity == null) {
    return { ok: false, message: "Enter a whole number of rides between 1 and 99." };
  }
  if (input.riddenOn != null && !isRideDateISO(input.riddenOn)) {
    return { ok: false, message: "Pick a valid ride date." };
  }

  const { data, error } = await supabase.rpc("adjust_ride_events", {
    p_coaster_id: input.coasterId,
    p_ridden_on: input.riddenOn,
    p_quantity: quantity,
  });

  if (error) {
    if (
      isMissingRideHistoryApi(error.message) ||
      isUniqueViolation(error.message) ||
      isAmbiguousColumn(error.message)
    ) {
      return adjustRideEventsDirect(supabase, {
        coasterId: input.coasterId,
        riddenOn: input.riddenOn,
        quantity,
      });
    }
    return { ok: false, message: friendlyLogError(error.message) };
  }

  const row = parseRpcJson<AdjustRideEventsRow>(data);
  if (row?.credit_removed || Number(row?.total_rides) === 0) {
    return { ok: true, summary: null };
  }
  if (row && Number(row.total_rides) > 0) {
    return {
      ok: true,
      summary: {
        coasterId: Number(row.coaster_id) || input.coasterId,
        totalRides: Number(row.total_rides),
        firstRiddenOn: row.first_ridden_on ?? null,
        lastRiddenOn: row.last_ridden_on ?? null,
      },
    };
  }

  return adjustRideEventsDirect(supabase, {
    coasterId: input.coasterId,
    riddenOn: input.riddenOn,
    quantity,
  });
}
