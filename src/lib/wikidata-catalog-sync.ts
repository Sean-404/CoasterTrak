import { readFile } from "node:fs/promises";
import path from "node:path";
import { reconcileCountryWithCoords } from "@/lib/geo-country";
import {
  findParkMatchByNameAndLocation,
  type ParkForMatch,
} from "@/lib/park-match";
import { finishSyncRun, startSyncRun } from "@/lib/sync-run";
import {
  inferCoasterType,
  wikidataInsertName,
  yearFromDate,
} from "@/lib/wikidata-coaster-inference";
import { mergeRowsByItem, type WikidataCoasterRow } from "@/lib/wikidata-coasters";

async function loadWikidataRows(): Promise<WikidataCoasterRow[]> {
  const url = process.env.WIKIDATA_COASTERS_URL?.trim();
  if (url) {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      throw new Error(`WIKIDATA_COASTERS_URL fetch failed (${res.status})`);
    }
    return JSON.parse(await res.text()) as WikidataCoasterRow[];
  }
  const rel = process.env.WIKIDATA_COASTERS_PATH?.trim() ?? "data/wikidata_coasters.json";
  const filepath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  let raw: string;
  try {
    raw = await readFile(filepath, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(
        `Wikidata catalog file missing (${filepath}). Run \`npm run wikidata:fetch\` to create it, ` +
          "or set WIKIDATA_COASTERS_URL to a hosted JSON (see README).",
      );
    }
    throw e;
  }
  return JSON.parse(raw) as WikidataCoasterRow[];
}

function parkGroupKey(parkName: string, country: string | null | undefined): string {
  return `${parkName.trim().toLowerCase()}|${(country ?? "").trim().toLowerCase()}`;
}

function groupCentroid(rows: WikidataCoasterRow[]): { lat: number; lng: number } | null {
  let sumLat = 0;
  let sumLng = 0;
  let n = 0;
  for (const r of rows) {
    if (
      r.latitude != null &&
      r.longitude != null &&
      Number.isFinite(r.latitude) &&
      Number.isFinite(r.longitude)
    ) {
      sumLat += r.latitude;
      sumLng += r.longitude;
      n++;
    }
  }
  if (!n) return null;
  return { lat: sumLat / n, lng: sumLng / n };
}

function majorityCountry(rows: WikidataCoasterRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const c = r.countryLabel?.trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [c, k] of counts) {
    if (k > bestN) {
      bestN = k;
      best = c;
    }
  }
  return best;
}

function coasterUpsertPayload(wd: WikidataCoasterRow, parkId: number) {
  const name = wikidataInsertName(wd);
  const inferred = inferCoasterType(wd.coasterTypeLabel, wd.manufacturerLabel) ?? "Unknown";
  const status = wd.status === "defunct" ? "Defunct" : "Operating";
  const openingYear = yearFromDate(wd.openingDate);
  const closingYear = yearFromDate(wd.demolishedDate) ?? yearFromDate(wd.retirementDate);

  return {
    park_id: parkId,
    name,
    wikidata_id: wd.wikidataId,
    coaster_type: inferred,
    manufacturer: wd.manufacturerLabel ?? null,
    status,
    length_ft: wd.lengthFt != null ? Math.round(wd.lengthFt) : null,
    speed_mph: wd.speedMph != null ? Math.round(wd.speedMph) : null,
    height_ft: wd.heightFt != null ? Math.round(wd.heightFt) : null,
    inversions: wd.inversions ?? null,
    duration_s: wd.durationS != null ? Math.round(wd.durationS) : null,
    opening_year: openingYear,
    closing_year: closingYear,
    external_source: "wikidata",
    external_id: wd.wikidataId,
    last_synced_at: new Date().toISOString(),
  };
}

const UPSERT_CHUNK = 200;

/**
 * Full catalog sync from merged Wikidata JSON (see `npm run wikidata:fetch`).
 * Creates/updates parks and upserts coasters. Parks without coordinates are skipped
 * (nothing to show on the map).
 */
export async function syncCatalogFromWikidata() {
  const { supabase, startedAt, runId } = await startSyncRun("wikidata");
  try {
    const merged = mergeRowsByItem(await loadWikidataRows());

    const groups = new Map<string, WikidataCoasterRow[]>();
    for (const row of merged) {
      const pl = row.parkLabel?.trim();
      if (!pl) continue;
      const key = parkGroupKey(pl, row.countryLabel);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    const { data: existingParks, error: parksLoadErr } = await supabase
      .from("parks")
      .select("id, name, country, latitude, longitude, queue_times_park_id");
    if (parksLoadErr) throw parksLoadErr;

    const parkRows = (existingParks ?? []) as ParkForMatch[];

    const parkIdByKey = new Map<string, number>();
    for (const p of parkRows) {
      parkIdByKey.set(parkGroupKey(p.name, p.country), p.id);
    }

    let parkUpdates = 0;
    let coasterUpdates = 0;

    const coasterBatch: ReturnType<typeof coasterUpsertPayload>[] = [];

    async function flushCoasters() {
      if (!coasterBatch.length) return;
      const chunk = coasterBatch.splice(0, UPSERT_CHUNK);
      const { error } = await supabase.from("coasters").upsert(chunk, {
        onConflict: "park_id,external_source,external_id",
      });
      if (error) throw error;
      coasterUpdates += chunk.length;
    }

    for (const [gKey, groupRows] of groups) {
      const centroid = groupCentroid(groupRows);
      if (!centroid) continue;

      const rawCountry = majorityCountry(groupRows);
      const country = reconcileCountryWithCoords(
        rawCountry,
        centroid.lat,
        centroid.lng,
      );
      const parkName = groupRows[0]!.parkLabel!.trim();

      let parkId = parkIdByKey.get(gKey);

      if (!parkId) {
        const linked = findParkMatchByNameAndLocation(
          parkRows,
          parkName,
          centroid.lat,
          centroid.lng,
          12,
        );
        if (linked) {
          parkId = linked.id;
          parkIdByKey.set(gKey, parkId);
        }
      }

      if (!parkId) {
        const insertRes = await supabase
          .from("parks")
          .insert({
            name: parkName,
            country,
            latitude: centroid.lat,
            longitude: centroid.lng,
            external_source: "wikidata",
            external_id: null,
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insertRes.error) throw insertRes.error;
        parkId = insertRes.data.id as number;
        parkIdByKey.set(gKey, parkId);
        parkRows.push({
          id: parkId,
          name: parkName,
          country,
          latitude: centroid.lat,
          longitude: centroid.lng,
          queue_times_park_id: null,
        });
        parkUpdates += 1;
      } else {
        const row = parkRows.find((p) => p.id === parkId);
        const hasQueueTimes = row?.queue_times_park_id != null;
        const updateRes = await supabase
          .from("parks")
          .update({
            country,
            latitude: centroid.lat,
            longitude: centroid.lng,
            ...(hasQueueTimes ? {} : { external_source: "wikidata" }),
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", parkId);
        if (updateRes.error) throw updateRes.error;
        if (row) {
          row.country = country;
          row.latitude = centroid.lat;
          row.longitude = centroid.lng;
        }
        parkUpdates += 1;
      }

      for (const wd of groupRows) {
        coasterBatch.push(coasterUpsertPayload(wd, parkId));
        if (coasterBatch.length >= UPSERT_CHUNK) await flushCoasters();
      }
    }

    await flushCoasters();

    await finishSyncRun(runId, "success", { recordsUpdated: parkUpdates + coasterUpdates });

    return {
      source: "wikidata" as const,
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
