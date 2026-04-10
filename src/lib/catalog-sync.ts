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

// Includes both abbreviations and full names (e.g. "uk" + "united kingdom")
// because the Kaggle CSV uses both forms inconsistently. This set is only used
// to validate whether a string looks like a real country — not to normalize it.
const KNOWN_COUNTRIES = new Set([
  "united states", "united kingdom", "canada", "mexico", "germany", "france",
  "spain", "italy", "netherlands", "belgium", "austria", "switzerland",
  "denmark", "sweden", "norway", "finland", "poland", "czech republic",
  "japan", "china", "south korea", "taiwan", "india", "thailand", "vietnam",
  "malaysia", "singapore", "indonesia", "philippines", "hong kong",
  "australia", "new zealand", "brazil", "argentina", "colombia", "chile",
  "costa rica", "guatemala", "united arab emirates", "qatar", "saudi arabia",
  "israel", "turkey", "egypt", "south africa", "russia", "ukraine",
  "ireland", "portugal", "greece", "hungary", "romania", "croatia",
  "u.s.", "usa", "uk", "uae",
]);

function inferCountry(location: string, parkName?: string) {
  if (!location) return "Unknown";
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  const candidate = parts.length ? parts[parts.length - 1] : "";
  if (!candidate) return "Unknown";
  // Reject values that are clearly not countries (e.g. the park name itself)
  if (parkName && candidate.toLowerCase() === parkName.toLowerCase()) return "Unknown";
  if (candidate.includes("Park") || candidate.includes("Land") || candidate.includes("World")) return "Unknown";
  // Accept known countries or anything with a comma (likely "City, Country")
  if (KNOWN_COUNTRIES.has(candidate.toLowerCase()) || parts.length >= 2) return candidate;
  return "Unknown";
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

    // Fetch all local parks: those already linked by queue_times_park_id, and those without
    // one (candidates for auto-linking by name match against Queue-Times data).
    const localParksRes = await supabase.from("parks").select("id, name, queue_times_park_id");
    if (localParksRes.error) throw localParksRes.error;

    const localByQueueId = new Map<number, number>();
    const localByName = new Map<string, number>(); // unlinked parks keyed by name
    const allLocalNames = new Set<string>(); // every park name, to detect truly new ones

    for (const park of localParksRes.data ?? []) {
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

    for (const externalPark of allParks) {
      let localParkId = localByQueueId.get(externalPark.id);

      if (!localParkId) {
        const nameKey = externalPark.name.toLowerCase().trim();
        const candidateId = localByName.get(nameKey);

        if (candidateId) {
          // Auto-link an existing unlinked park (e.g. synced from Kaggle without coordinates).
          localParkId = candidateId;
          localByQueueId.set(externalPark.id, localParkId);
          localByName.delete(nameKey);
        } else if (!allLocalNames.has(nameKey)) {
          // Park doesn't exist in our DB at all — create it from Queue-Times data.
          // This covers parks like Energylandia that aren't in the Kaggle dataset.
          const insertRes = await supabase
            .from("parks")
            .insert({
              name: externalPark.name,
              country: externalPark.country,
              latitude: Number.parseFloat(externalPark.latitude),
              longitude: Number.parseFloat(externalPark.longitude),
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
          parkUpdates += 1;
        } else {
          // Name exists but under a slightly different spelling — skip to avoid duplicates.
          continue;
        }
      }

      const updatePark = await supabase
        .from("parks")
        .update({
          queue_times_park_id: externalPark.id,
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

  try {
    const csvUrl = process.env.KAGGLE_CSV_URL;
    if (!csvUrl) {
      throw new Error("Missing KAGGLE_CSV_URL");
    }

    const response = await fetch(csvUrl, { next: { revalidate: 86400 } });
    if (!response.ok) {
      throw new Error(`Kaggle CSV fetch failed (${response.status})`);
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
      // In this dataset "Location" holds the park name (e.g. "Coney Island")
      const parkName = pickValue(row, ["park_name", "Park", "park", "amusement_park", "Location", "location"]);
      const locationField = pickValue(row, ["country", "Country", "Location", "location"]);
      if (!coasterName || !parkName) continue;

      const country = inferCountry(locationField, parkName);
      const parkKey = `${parkName}::${country}`.toLowerCase();
      let parkId: number | null = parksByKey.get(parkKey) ?? null;

      const rowLat = parseFloat(pickValue(row, ["latitude", "Latitude", "lat"]));
      const rowLng = parseFloat(pickValue(row, ["longitude", "Longitude", "lng", "lon"]));
      const lat = isFinite(rowLat) ? rowLat : 0;
      const lng = isFinite(rowLng) ? rowLng : 0;

      if (!parkId) {
        // Look up by name first (ignoring country) so a park that already exists
        // under a correct country isn't duplicated when the CSV has a bad country
        // value (e.g. "Location = Alton Towers" → inferCountry returns "Alton Towers").
        const existingPark = await supabase
          .from("parks")
          .select("id, country")
          .eq("name", parkName)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (existingPark.error) throw existingPark.error;

        if (existingPark.data?.id) {
          parkId = existingPark.data.id;
          const updates: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
          // Only overwrite the stored country when the inferred one looks like a real
          // country (i.e. it differs from the park name itself).
          if (country !== parkName && country !== "Unknown" && existingPark.data.country === parkName) {
            updates.country = country;
          }
          if (lat !== 0 || lng !== 0) {
            updates.latitude = lat;
            updates.longitude = lng;
          }
          await supabase.from("parks").update(updates).eq("id", parkId);
        } else {
          // Don't create parks with no coordinates — they're invisible on the map
          // and likely have bad country data too. They'll get proper data if/when
          // the Queue-Times sync runs and finds them.
          if (lat === 0 && lng === 0) continue;

          const insertedPark = await supabase
            .from("parks")
            .insert({
              name: parkName,
              country,
              latitude: lat,
              longitude: lng,
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

      const coasterType = pickValue(row, ["Type_Main", "coaster_type", "Type", "type"]) || normalizeType(coasterName);
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
