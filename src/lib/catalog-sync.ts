import { getSupabaseServerClient } from "@/lib/supabase-server";
import Papa from "papaparse";

type QueueTimesPark = {
  id: number;
  name: string;
  country: string;
  latitude: string;
  longitude: string;
};

type QueueTimesParkGroup = {
  parks?: QueueTimesPark[];
};

type QueueTimesRide = {
  id: number;
  name: string;
  is_open: boolean;
};

type QueueTimesQueueResponse = {
  rides?: QueueTimesRide[];
  lands?: { rides?: QueueTimesRide[] }[];
};

type KaggleRow = Record<string, string>;

function normalizeType(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("wood")) return "Wood";
  if (lower.includes("invert")) return "Inverted";
  if (lower.includes("launch")) return "Launch";
  if (lower.includes("hyper") || lower.includes("giga")) return "Steel";
  return "Unknown";
}

function normalizeStatus(status?: string, isOpen?: boolean) {
  if (typeof isOpen === "boolean") return isOpen ? "Operating" : "Closed";
  const lower = (status ?? "").toLowerCase();
  if (lower.includes("operat") || lower.includes("open")) return "Operating";
  if (lower.includes("close") || lower.includes("down")) return "Closed";
  return "Operating";
}

function pickValue(row: KaggleRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function inferCountry(location: string) {
  if (!location) return "Unknown";
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Unknown";
}

async function startSyncRun(source: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
  }

  const startedAt = new Date().toISOString();
  const runStart = await supabase
    .from("sync_runs")
    .insert({ source, status: "running", started_at: startedAt })
    .select("id")
    .single();
  return { supabase, startedAt, runId: runStart.data?.id ?? null };
}

async function finishSyncRun(
  runId: number | null,
  status: "success" | "failed",
  payload: { recordsUpdated?: number; error?: string | null } = {},
) {
  const supabase = getSupabaseServerClient();
  if (!supabase || !runId) return;

  await supabase
    .from("sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_updated: payload.recordsUpdated ?? 0,
      error: payload.error ?? null,
    })
    .eq("id", runId);
}

export async function syncCatalogFromQueueTimes() {
  const { supabase, startedAt, runId } = await startSyncRun("queue-times");
  try {
    const parksRes = await fetch("https://queue-times.com/parks.json", { next: { revalidate: 3600 } });
    if (!parksRes.ok) throw new Error(`Queue-Times parks fetch failed (${parksRes.status})`);

    const parkGroups = (await parksRes.json()) as QueueTimesParkGroup[];
    const allParks = parkGroups.flatMap((g) => g.parks ?? []);

    // Keep scope controlled for free tier: sync only parks already in our DB by queue_times_park_id.
    const localParksRes = await supabase.from("parks").select("id, queue_times_park_id");
    if (localParksRes.error) throw localParksRes.error;

    const localByQueueId = new Map<number, number>();
    for (const park of localParksRes.data ?? []) {
      if (typeof park.queue_times_park_id === "number") {
        localByQueueId.set(park.queue_times_park_id, park.id);
      }
    }

    let coasterUpdates = 0;
    let parkUpdates = 0;

    for (const externalPark of allParks) {
      const localParkId = localByQueueId.get(externalPark.id);
      if (!localParkId) continue;

      const updatePark = await supabase
        .from("parks")
        .update({
          external_source: "queue-times",
          external_id: String(externalPark.id),
          latitude: Number.parseFloat(externalPark.latitude),
          longitude: Number.parseFloat(externalPark.longitude),
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", localParkId);
      if (updatePark.error) throw updatePark.error;
      parkUpdates += 1;

      const queueRes = await fetch(`https://queue-times.com/parks/${externalPark.id}/queue_times.json`, {
        next: { revalidate: 300 },
      });
      if (!queueRes.ok) continue;

      const queuePayload = (await queueRes.json()) as QueueTimesQueueResponse;
      const rides = [...(queuePayload.rides ?? []), ...(queuePayload.lands?.flatMap((l) => l.rides ?? []) ?? [])];

      for (const ride of rides) {
        const upsertRes = await supabase.from("coasters").upsert(
          {
            park_id: localParkId,
            name: ride.name,
            coaster_type: normalizeType(ride.name),
            status: normalizeStatus(undefined, ride.is_open),
            external_source: "queue-times",
            external_id: String(ride.id),
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "park_id,name" },
        );
        if (upsertRes.error) throw upsertRes.error;
        coasterUpdates += 1;
      }
    }

    await finishSyncRun(runId, "success", { recordsUpdated: parkUpdates + coasterUpdates });

    return {
      source: "queue-times",
      startedAt,
      finishedAt: new Date().toISOString(),
      parkUpdates,
      coasterUpdates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await finishSyncRun(runId, "failed", { error: message });
    throw error;
  }
}

export async function syncCatalogFromKaggleCsv() {
  const { supabase, startedAt, runId } = await startSyncRun("kaggle");
  const csvUrl = process.env.KAGGLE_CSV_URL;
  if (!csvUrl) {
    throw new Error("Missing KAGGLE_CSV_URL");
  }

  try {
    const response = await fetch(csvUrl, { next: { revalidate: 86400 } });
    if (!response.ok) {
      throw new Error(`Kaggle CSV fetch failed (${response.status}) at ${csvUrl}`);
    }

    const csvText = await response.text();
    const parsed = Papa.parse<KaggleRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (parsed.errors.length) {
      throw new Error(`Kaggle CSV parse error: ${parsed.errors[0].message}`);
    }

    const rows = parsed.data;
    let parkUpdates = 0;
    let coasterUpdates = 0;

    const parksByKey = new Map<string, number>();

    for (const row of rows) {
      const coasterName = pickValue(row, ["coaster_name", "Name", "name", "Coaster", "roller_coaster"]);
      const parkName = pickValue(row, ["park_name", "Park", "park", "amusement_park"]);
      const location = pickValue(row, ["location", "Location", "country", "Country"]);
      if (!coasterName || !parkName) continue;

      const country = inferCountry(location);
      const parkKey = `${parkName}::${country}`.toLowerCase();
      let parkId: number | null = parksByKey.get(parkKey) ?? null;

      if (!parkId) {
        const existingPark = await supabase
          .from("parks")
          .select("id")
          .eq("name", parkName)
          .eq("country", country)
          .maybeSingle();
        if (existingPark.error) throw existingPark.error;

        if (existingPark.data?.id) {
          parkId = existingPark.data.id;
        } else {
          const insertedPark = await supabase
            .from("parks")
            .insert({
              name: parkName,
              country,
              latitude: 0,
              longitude: 0,
              external_source: "kaggle",
              external_id: null,
              last_synced_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (insertedPark.error) throw insertedPark.error;
          parkId = insertedPark.data.id;
          parkUpdates += 1;
        }

        if (parkId !== null) {
          parksByKey.set(parkKey, parkId);
        }
      }

      const coasterType = pickValue(row, ["coaster_type", "Type", "type"]) || normalizeType(coasterName);
      const status = normalizeStatus(pickValue(row, ["status", "Status"]));
      const externalId = pickValue(row, ["coaster_id", "id", "Id"]);

      if (parkId === null) continue;

      const coasterUpsert = await supabase.from("coasters").upsert(
        {
          park_id: parkId,
          name: coasterName,
          coaster_type: coasterType,
          status,
          external_source: "kaggle",
          external_id: externalId || null,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "park_id,name" },
      );
      if (coasterUpsert.error) throw coasterUpsert.error;
      coasterUpdates += 1;
    }

    await finishSyncRun(runId, "success", { recordsUpdated: parkUpdates + coasterUpdates });
    return {
      source: "kaggle",
      csvUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      parkUpdates,
      coasterUpdates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await finishSyncRun(runId, "failed", { error: message });
    throw error;
  }
}
