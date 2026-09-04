"use client";

import { useEffect, useRef, useState } from "react";
import { DateField } from "@/components/date-field";
import { RideHistoryEditor } from "@/components/ride-history-editor";
import {
  formatRideCount,
  formatRideOnDate,
  localDateISO,
  MAX_RIDES_PER_EVENT,
  parseRideQuantity,
  type RideCreditSummary,
} from "@/lib/ride-history";
import { loadRideCreditSummaries, logRideEvents } from "@/lib/ride-log";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type Status = "loading" | "idle" | "loading-wishlist" | "loading-ridden" | "wishlisted" | "error";

type ActionStore = {
  ready: boolean;
  userId: string | null;
  error: string | null;
  credits: Map<number, RideCreditSummary>;
  wishlisted: Set<number>;
};

const actionStore: ActionStore = {
  ready: false,
  userId: null,
  error: null,
  credits: new Map(),
  wishlisted: new Set<number>(),
};

let actionStoreInitPromise: Promise<void> | null = null;
const actionStoreListeners = new Set<() => void>();

function emitActionStoreChange() {
  for (const listener of actionStoreListeners) listener();
}

function subscribeActionStore(listener: () => void) {
  actionStoreListeners.add(listener);
  return () => {
    actionStoreListeners.delete(listener);
  };
}

function emptyCredit(coasterId: number): RideCreditSummary {
  return { coasterId, totalRides: 1, firstRiddenOn: null, lastRiddenOn: null };
}

async function ensureActionStoreLoaded(forceRefresh = false) {
  if (actionStore.ready && !forceRefresh) return;
  if (actionStoreInitPromise) return actionStoreInitPromise;

  actionStoreInitPromise = (async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      actionStore.ready = true;
      actionStore.userId = null;
      actionStore.error = null;
      actionStore.credits = new Map();
      actionStore.wishlisted = new Set<number>();
      emitActionStoreChange();
      return;
    }

    const user = await getSupabaseUserSafe();
    if (!user) {
      actionStore.ready = true;
      actionStore.userId = null;
      actionStore.error = null;
      actionStore.credits = new Map();
      actionStore.wishlisted = new Set<number>();
      emitActionStoreChange();
      return;
    }

    const userId = user.id;
    const [summariesRes, ridesRes, wishRes] = await Promise.all([
      loadRideCreditSummaries(supabase, userId),
      supabase.from("rides").select("coaster_id").eq("user_id", userId),
      supabase.from("wishlist").select("coaster_id").eq("user_id", userId),
    ]);

    if (ridesRes.error || wishRes.error) {
      actionStore.ready = true;
      actionStore.userId = userId;
      actionStore.error = "Could not load ride state.";
      emitActionStoreChange();
      return;
    }

    const credits = new Map<number, RideCreditSummary>();
    for (const summary of summariesRes.summaries) {
      credits.set(summary.coasterId, summary);
    }
    for (const row of ridesRes.data ?? []) {
      const coasterId = row.coaster_id as number;
      if (!credits.has(coasterId)) credits.set(coasterId, emptyCredit(coasterId));
    }

    actionStore.ready = true;
    actionStore.userId = userId;
    actionStore.error = null;
    actionStore.credits = credits;
    actionStore.wishlisted = new Set((wishRes.data ?? []).map((row) => row.coaster_id as number));
    emitActionStoreChange();
  })().finally(() => {
    actionStoreInitPromise = null;
  });

  return actionStoreInitPromise;
}

function setWishlisted(coasterId: number, value: boolean) {
  if (value) actionStore.wishlisted.add(coasterId);
  else actionStore.wishlisted.delete(coasterId);
  emitActionStoreChange();
}

export function applyRideCredit(coasterId: number, summary: RideCreditSummary | null) {
  if (summary) actionStore.credits.set(coasterId, summary);
  else actionStore.credits.delete(coasterId);
  emitActionStoreChange();
}

export function CoasterActions({
  coasterId,
  disableWishlist = false,
  variant = "compact",
}: {
  coasterId: number;
  disableWishlist?: boolean;
  variant?: "compact" | "prominent" | "inline";
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [feedback, setFeedback] = useState("");
  const [storeTick, setStoreTick] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [rideDate, setRideDate] = useState(() => localDateISO());
  const [historyBusy, setHistoryBusy] = useState(false);
  const loggingRef = useRef(false);

  const credit = actionStore.credits.get(coasterId) ?? null;
  const alreadyRidden = credit != null;
  const alreadyWishlisted = actionStore.wishlisted.has(coasterId);

  useEffect(() => {
    const unsubscribe = subscribeActionStore(() => {
      setStoreTick((x) => x + 1);
    });
    void ensureActionStoreLoaded(true).then(() => {
      if (actionStore.error) {
        setStatus("error");
        setErrorMsg(actionStore.error);
      } else {
        setStatus("idle");
      }
    });
    return unsubscribe;
  }, []);

  async function withUser(action: (userId: string) => Promise<void>) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("error");
      setErrorMsg("Supabase not configured.");
      return;
    }
    await ensureActionStoreLoaded();
    const userId = actionStore.userId;
    if (!userId) {
      setStatus("error");
      setErrorMsg("Sign in to track rides.");
      return;
    }
    await action(userId);
  }

  async function addWishlist() {
    if (status !== "idle") return;
    setStatus("loading-wishlist");
    await withUser(async (userId) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { error } = await supabase.from("wishlist").upsert(
        { user_id: userId, coaster_id: coasterId },
        { onConflict: "user_id,coaster_id", ignoreDuplicates: true },
      );
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
      } else {
        setStatus("wishlisted");
        setWishlisted(coasterId, true);
      }
    });
  }

  async function logRides(nextQuantity: number, nextDate?: string | null) {
    if (loggingRef.current) return;
    const parsed = parseRideQuantity(nextQuantity);
    if (parsed == null) {
      setStatus("error");
      setErrorMsg("Enter a whole number of rides between 1 and 99.");
      return;
    }
    loggingRef.current = true;
    setStatus("loading-ridden");
    setErrorMsg("");
    setFeedback("");
    try {
      await withUser(async () => {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;
        const result = await logRideEvents(supabase, {
          coasterId,
          ...(nextDate ? { riddenOn: nextDate } : {}),
          quantity: parsed,
        });
        if (!result.ok) {
          setStatus("error");
          setErrorMsg(result.message);
          return;
        }
        applyRideCredit(coasterId, result.summary);
        if (alreadyWishlisted) setWishlisted(coasterId, false);
        setQuantity(1);
        setStatus("idle");
        setFeedback(
          nextDate
            ? parsed === 1
              ? "Ride logged!"
              : `Logged ${parsed} rides`
            : "Marked as ridden",
        );
        window.setTimeout(() => setFeedback(""), 1800);
      });
    } finally {
      loggingRef.current = false;
    }
  }

  if (status === "loading" || !actionStore.ready) {
    return variant === "inline" ? <span className="inline-flex h-7 min-w-[4.5rem]" aria-hidden /> : null;
  }

  const busy = status === "loading-wishlist" || status === "loading-ridden" || historyBusy;
  const prominent = variant === "prominent";
  const inline = variant === "inline";
  const controlClass = prominent
    ? "min-h-11 px-4 py-2.5 text-sm"
    : "inline-flex h-9 items-center px-2.5 text-xs";

  const countLabel = credit ? formatRideCount(credit.totalRides) : null;
  const firstLabel = credit ? formatRideOnDate(credit.firstRiddenOn) : null;
  const lastLabel = credit ? formatRideOnDate(credit.lastRiddenOn) : null;
  const message = status === "error" ? errorMsg : feedback;

  const firstRideButton = !alreadyRidden && (
    <button
      type="button"
      onClick={() => void logRides(1)}
      disabled={busy}
      className={`cursor-pointer rounded-md border border-slate-300 font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60 ${controlClass}`}
    >
      {status === "loading-ridden" ? "Saving…" : prominent ? "Mark as ridden" : "Mark ridden"}
    </button>
  );

  const addAnother = alreadyRidden && (
    prominent ? (
      <div className="w-full min-w-0 space-y-3">
        <div className="rounded-xl bg-green-50 px-3 py-3">
          <p className="text-sm font-semibold text-green-800">
            You&apos;ve ridden this {countLabel}
          </p>
          {(firstLabel || lastLabel) && (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-green-900/80">
              {firstLabel ? (
                <div>
                  <dt className="font-medium text-green-700/80">First ridden</dt>
                  <dd className="mt-0.5 tabular-nums">{firstLabel}</dd>
                </div>
              ) : null}
              {lastLabel ? (
                <div>
                  <dt className="font-medium text-green-700/80">Last ridden</dt>
                  <dd className="mt-0.5 tabular-nums">{lastLabel}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </div>
        <RideHistoryEditor
          coasterId={coasterId}
          refreshKey={`${credit?.totalRides ?? 0}-${credit?.lastRiddenOn ?? ""}`}
          disabled={busy}
          onBusyChange={setHistoryBusy}
          onChanged={(summary) => {
            applyRideCredit(coasterId, summary);
            setStatus("idle");
            setErrorMsg("");
            setFeedback(summary ? "Ride count updated" : "Credit removed");
            window.setTimeout(() => setFeedback(""), 1800);
          }}
        />
        <DateField value={rideDate} onChange={setRideDate} disabled={busy} />
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              aria-label="Fewer rides"
              disabled={busy || quantity <= 1}
              onClick={() => setQuantity((n) => Math.max(1, n - 1))}
              className="flex min-h-11 min-w-11 items-center justify-center text-lg font-semibold text-slate-700 disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-8 text-center text-base font-semibold tabular-nums text-slate-900">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="More rides"
              disabled={busy || quantity >= MAX_RIDES_PER_EVENT}
              onClick={() => setQuantity((n) => Math.min(MAX_RIDES_PER_EVENT, n + 1))}
              className="flex min-h-11 min-w-11 items-center justify-center text-lg font-semibold text-slate-700 disabled:opacity-40"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => void logRides(quantity, rideDate)}
            disabled={busy}
            className="min-h-11 flex-1 cursor-pointer rounded-md bg-amber-500 px-4 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "loading-ridden" ? "Saving…" : quantity === 1 ? "Add ride" : `Add ${quantity} rides`}
          </button>
        </div>
      </div>
    ) : (
      <div className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-9 items-center rounded-md bg-green-100 px-2.5 text-xs font-semibold text-green-800">
          {credit && credit.totalRides > 1 ? `Ridden ×${credit.totalRides}` : "Ridden"}
        </span>
        <button
          type="button"
          onClick={() => void logRides(1, localDateISO())}
          disabled={busy}
          aria-label="Log another ride today"
          className="inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md bg-amber-500 px-2.5 text-xs font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
        >
          {status === "loading-ridden" ? "…" : "+1"}
        </button>
      </div>
    )
  );

  const body = (
    <div className={`flex min-w-0 flex-col ${prominent ? "gap-2" : "gap-1.5"}`}>
      {message ? (
        <p className={`text-xs font-medium ${status === "error" ? "text-red-500" : "text-green-600"}`}>
          {message}
        </p>
      ) : null}
      {prominent && !alreadyRidden ? (
        <p className="text-xs text-slate-500">
          Adds a credit without a ride date. Log a day later when you want it in Month Wrapped.
        </p>
      ) : null}
      <div className={`flex min-w-0 flex-wrap items-center ${prominent ? "gap-2" : "gap-1.5"}`}>
        {alreadyWishlisted && !alreadyRidden && (
          <span
            className={`inline-flex h-9 items-center rounded-md bg-amber-100 font-semibold text-amber-700 ${
              prominent ? "px-3 text-xs" : "px-2.5 text-xs"
            }`}
          >
            Wishlisted
          </span>
        )}
        {!disableWishlist && !alreadyWishlisted && !alreadyRidden && (
          <button
            type="button"
            onClick={addWishlist}
            disabled={busy}
            className={`cursor-pointer rounded-md bg-amber-500 font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60 ${controlClass}`}
          >
            {status === "loading-wishlist" ? "Saving…" : prominent ? "Add to wishlist" : "Wishlist"}
          </button>
        )}
        {firstRideButton}
        {addAnother}
      </div>
    </div>
  );

  if (inline) {
    return <div data-store-tick={storeTick}>{body}</div>;
  }

  return (
    <div className={prominent ? "mt-4 min-h-[40px] min-w-0" : "mt-2 min-h-[32px]"} data-store-tick={storeTick}>
      {body}
    </div>
  );
}
