import { findParkMatchForQueueTimes, type ParkForMatch } from "@/lib/park-match";
import { finishSyncRun, startSyncRun } from "@/lib/sync-run";

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

function normalizeType(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("wood") || lower.includes("timber") || lower.includes("wooden")) return "Wood";
  if (lower.includes("invert")) return "Inverted";
  if (lower.includes("launch") || lower.includes("catapult")) return "Launch";
  if (lower.includes("flying")) return "Steel";
  if (lower.includes("hybrid") || lower.includes("rmc")) return "Hybrid";
  if (lower.includes("hyper") || lower.includes("giga") || lower.includes("strata")) return "Steel";
  return "Unknown";
}

function normalizeStatus(status?: string, isOpen?: boolean) {
  if (typeof isOpen === "boolean") return isOpen ? "Operating" : "Closed";
  const lower = (status ?? "").toLowerCase();
  if (lower.includes("operat") || lower.includes("open")) return "Operating";
  if (lower.includes("close") || lower.includes("down")) return "Closed";
  return "Operating";
}

// Queue-Times sometimes uses regions/states instead of countries.
const REGION_TO_COUNTRY: Record<string, string> = {
  "england": "United Kingdom", "scotland": "United Kingdom",
  "wales": "United Kingdom", "northern ireland": "United Kingdom",
  "bavaria": "Germany", "catalonia": "Spain",
  "queensland": "Australia", "new south wales": "Australia", "victoria": "Australia",
  "ontario": "Canada", "quebec": "Canada", "british columbia": "Canada",
};

function normalizeCountry(country: string): string {
  return REGION_TO_COUNTRY[country.toLowerCase()] ?? country;
}

/**
 * Queue-Times has published at least one US park (Epic Universe) with a positive
 * longitude that should be western-hemisphere (e.g. +81.45 instead of -81.45),
 * which places the pin in Nepal. Real US parks in the contiguous / Orlando band
 * always have negative longitude.
 */
function queueTimesUsLongitudeFix(country: string, lat: number, lng: number): number {
  const c = normalizeCountry(country).toLowerCase();
  if (c !== "united states") return lng;
  // Contiguous US + Florida / Orlando latitude band: lon must be negative (~-125…-65).
  if (lng > 0 && lat >= 22 && lat <= 50) return -lng;
  return lng;
}

/** Run up to `limit` async tasks concurrently. */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const iter = items[Symbol.iterator]();
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let next = iter.next(); !next.done; next = iter.next()) {
      await fn(next.value);
    }
  });
  await Promise.all(workers);
}

export async function syncCatalogFromQueueTimes() {
  const { supabase, startedAt, runId } = await startSyncRun("queue-times");
  try {
    const parksRes = await fetch("https://queue-times.com/parks.json", { next: { revalidate: 3600 } });
    if (!parksRes.ok) throw new Error(`Queue-Times parks fetch failed (${parksRes.status})`);

    const parkGroups = (await parksRes.json()) as QueueTimesParkGroup[];
    const allParks = parkGroups.flatMap((g) => g.parks ?? []);

    // Fetch all local parks: those already linked by queue_times_park_id, and those without
    // one (candidates for auto-linking by name match against Queue-Times data).
    const localParksRes = await supabase
      .from("parks")
      .select("id, name, queue_times_park_id, latitude, longitude");
    if (localParksRes.error) throw localParksRes.error;

    const parkRows = (localParksRes.data ?? []) as ParkForMatch[];

    const localByQueueId = new Map<number, number>();
    const localByName = new Map<string, number>(); // unlinked parks keyed by name
    const allLocalNames = new Set<string>(); // every park name, to detect truly new ones

    for (const park of parkRows) {
      const key = park.name.toLowerCase().trim();
      allLocalNames.add(key);
      if (typeof park.queue_times_park_id === "number") {
        localByQueueId.set(park.queue_times_park_id, park.id);
      } else {
        localByName.set(key, park.id);
      }
    }

    let coasterUpdates = 0;
    let parkUpdates = 0;

    // Pass 1 (serial): resolve local park IDs — insert/link parks in the DB.
    // This must be serial to avoid race conditions on the shared maps.
    const resolvedParks: Array<{ externalPark: (typeof allParks)[number]; localParkId: number }> = [];

    for (const externalPark of allParks) {
      const qtLat = Number.parseFloat(externalPark.latitude);
      const qtLng = queueTimesUsLongitudeFix(
        externalPark.country,
        qtLat,
        Number.parseFloat(externalPark.longitude),
      );

      let localParkId = localByQueueId.get(externalPark.id);

      if (!localParkId) {
        const nameKey = externalPark.name.toLowerCase().trim();
        let candidateId = localByName.get(nameKey);

        if (!candidateId) {
          const fuzzy = findParkMatchForQueueTimes(
            parkRows,
            externalPark.id,
            externalPark.name,
            qtLat,
            qtLng,
            12,
          );
          if (fuzzy) candidateId = fuzzy.id;
        }

        if (candidateId) {
          // Auto-link an existing park (exact name, or fuzzy name + nearby coords vs Wikidata/other).
          localParkId = candidateId;
          localByQueueId.set(externalPark.id, localParkId);
          for (const [k, v] of localByName) {
            if (v === localParkId) localByName.delete(k);
          }
        } else if (!allLocalNames.has(nameKey)) {
          // Park doesn't exist in our DB at all — create it from Queue-Times data.
          const insertRes = await supabase
            .from("parks")
            .insert({
              name: externalPark.name,
              country: normalizeCountry(externalPark.country),
              latitude: qtLat,
              longitude: qtLng,
              queue_times_park_id: externalPark.id,
              external_source: "queue-times",
              external_id: String(externalPark.id),
              last_synced_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (insertRes.error) throw insertRes.error;
          localParkId = insertRes.data.id as number;
          localByQueueId.set(externalPark.id, localParkId);
          allLocalNames.add(nameKey);
          parkRows.push({
            id: localParkId,
            name: externalPark.name,
            country: normalizeCountry(externalPark.country),
            latitude: qtLat,
            longitude: qtLng,
            queue_times_park_id: externalPark.id,
          });
          parkUpdates += 1;
        } else {
          // Name exists under a slightly different spelling — skip to avoid duplicates.
          continue;
        }
      }

      const updatePark = await supabase
        .from("parks")
        .update({
          queue_times_park_id: externalPark.id,
          external_source: "queue-times",
          external_id: String(externalPark.id),
          latitude: qtLat,
          longitude: qtLng,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", localParkId);
      if (updatePark.error) throw updatePark.error;
      parkUpdates += 1;

      resolvedParks.push({ externalPark, localParkId });
    }

    // Pass 2 (parallel, concurrency=12): fetch each park's live queue times and upsert rides.
    // Running in parallel cuts the wall-clock time from ~5 min down to ~30 s.
    await withConcurrency(resolvedParks, 12, async ({ externalPark, localParkId }) => {
      const queueRes = await fetch(
        `https://queue-times.com/parks/${externalPark.id}/queue_times.json`,
        { next: { revalidate: 300 } },
      );
      if (!queueRes.ok) return;

      const queuePayload = (await queueRes.json()) as QueueTimesQueueResponse;
      const rides = [
        ...(queuePayload.rides ?? []),
        ...(queuePayload.lands?.flatMap((l) => l.rides ?? []) ?? []),
      ];

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
          { onConflict: "park_id,external_source,external_id" },
        );
        if (upsertRes.error) throw upsertRes.error;
        coasterUpdates += 1;
      }
    });

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

export { syncCatalogFromWikidata } from "@/lib/wikidata-catalog-sync";
