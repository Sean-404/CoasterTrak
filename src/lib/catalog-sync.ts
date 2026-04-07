import { getSupabaseServerClient } from "@/lib/supabase-server";

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
  if (lower.includes("wood")) return "Wood";
  if (lower.includes("invert")) return "Inverted";
  if (lower.includes("launch")) return "Launch";
  if (lower.includes("hyper") || lower.includes("giga")) return "Steel";
  return "Unknown";
}

export async function syncCatalogFromQueueTimes() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
  }

  const startedAt = new Date().toISOString();
  const runStart = await supabase
    .from("sync_runs")
    .insert({ source: "queue-times", status: "running", started_at: startedAt })
    .select("id")
    .single();
  const runId = runStart.data?.id ?? null;

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
            status: ride.is_open ? "Operating" : "Closed",
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

    if (runId) {
      await supabase
        .from("sync_runs")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          records_updated: parkUpdates + coasterUpdates,
          error: null,
        })
        .eq("id", runId);
    }

    return {
      source: "queue-times",
      startedAt,
      finishedAt: new Date().toISOString(),
      parkUpdates,
      coasterUpdates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    if (runId) {
      await supabase
        .from("sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: message,
        })
        .eq("id", runId);
    }
    throw error;
  }
}
