import {
  sanitizeCoasterImageUrl,
  shouldSkipWikidataCoasterId,
} from "@/lib/coaster-known-fixes";
import { reconcileCountryWithCoords } from "@/lib/geo-country";
import {
  findNearestParkForCoords,
  findParkMatchByNameAndLocation,
  isLikelyWaterParkName,
  parkNamesMatch,
  type ParkForMatch,
} from "@/lib/park-match";
import { finishSyncRun, startSyncRun } from "@/lib/sync-run";
import {
  inferCoasterType,
  wikidataInsertName,
  yearFromDate,
} from "@/lib/wikidata-coaster-inference";
import { upsertCoastersByExternalKeys } from "@/lib/coasters-external-upsert";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";
import { loadWikidataCatalogRows } from "@/lib/wikidata-catalog-source";
import { mergeRowsByItem, type WikidataCoasterRow } from "@/lib/wikidata-coasters";

type ParkForSync = ParkForMatch & {
  external_source: string | null;
  external_id: string | null;
};

async function loadWikidataRows(): Promise<WikidataCoasterRow[]> {
  return loadWikidataCatalogRows({ revalidateSeconds: 3600 });
}

function parkGroupKey(parkName: string, country: string | null | undefined): string {
  return `${parkName.trim().toLowerCase()}|${(country ?? "").trim().toLowerCase()}`;
}

/** Multi-install / mislabeled Wikidata items → preferred on-park name for Orlando catalog. */
const COASTER_PARK_OVERRIDE_BY_WIKIDATA_ID: Record<string, string> = {
  Q3073731: "Universal's Islands of Adventure", // Flight of the Hippogriff
  Q21051432: "Universal Studios Florida", // Revenge of the Mummy (Orlando layout)
};

/** US mainland longitudes are west; some feeds store the absolute value. */
function normalizeSyncParkLongitude(
  lat: number,
  lng: number,
  country: string | null | undefined,
): number {
  const c = (country ?? "").toLowerCase();
  const us =
    c.includes("united states") || c === "usa" || c === "us" || c.endsWith(", us");
  if (us && lat > 24 && lat < 50 && lng > 65 && lng < 130) {
    return -Math.abs(lng);
  }
  return lng;
}

function findParkIdByPreferredName(
  parkRows: ParkForSync[],
  preferredName: string,
): number | null {
  const want = preferredName.trim().toLowerCase();
  const exact = parkRows.find((p) => p.name.trim().toLowerCase() === want);
  if (exact) return exact.id;
  const fuzzy = parkRows.find((p) => parkNamesMatch(p.name, preferredName));
  return fuzzy?.id ?? null;
}

function unknownParkExternalIdForRow(wd: WikidataCoasterRow): string | null {
  if (
    wd.latitude == null ||
    wd.longitude == null ||
    !Number.isFinite(wd.latitude) ||
    !Number.isFinite(wd.longitude)
  ) {
    return null;
  }
  const country = reconcileCountryWithCoords(wd.countryLabel ?? null, wd.latitude, wd.longitude);
  const countrySlug = country.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `unknown-park:${countrySlug || "unknown"}:${wd.latitude.toFixed(4)}:${wd.longitude.toFixed(4)}`;
}

function unknownParkNameForRow(wd: WikidataCoasterRow): string {
  const country =
    wd.latitude != null && wd.longitude != null
      ? reconcileCountryWithCoords(wd.countryLabel ?? null, wd.latitude, wd.longitude)
      : (wd.countryLabel?.trim() || "Unknown");
  return country && country !== "Unknown"
    ? `Unknown / historical park (${country})`
    : "Unknown / historical park";
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

function majorityParkWikidataId(rows: WikidataCoasterRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const q = r.parkWikidataId?.trim().toUpperCase();
    if (!q) continue;
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [q, k] of counts) {
    if (k > bestN) {
      bestN = k;
      best = q;
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
    image_url: sanitizeCoasterImageUrl(wd.imageUrl ?? null),
    status,
    ...(wd.lengthFt != null ? { length_ft: Math.round(wd.lengthFt) } : {}),
    ...(wd.speedMph != null ? { speed_mph: Math.round(wd.speedMph) } : {}),
    ...(wd.heightFt != null ? { height_ft: Math.round(wd.heightFt) } : {}),
    ...(wd.inversions != null ? { inversions: wd.inversions } : {}),
    ...(wd.durationS != null ? { duration_s: Math.round(wd.durationS) } : {}),
    ...(openingYear != null ? { opening_year: openingYear } : {}),
    ...(closingYear != null ? { closing_year: closingYear } : {}),
    external_source: "wikidata",
    external_id: wd.wikidataId,
    last_synced_at: new Date().toISOString(),
  };
}

const UPSERT_CHUNK = 200;

/**
 * Full catalog sync from the Wikidata JSON snapshot (CoasterTrak Data pipeline / WIKIDATA_COASTERS_URL).
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

    const { data: existingParks, error: parksLoadErr } = await fetchAllPages<ParkForSync>(
      SUPABASE_PAGE_SIZE,
      (from, to) =>
        supabase
          .from("parks")
          .select("id, name, country, latitude, longitude, external_source, external_id")
          .order("id", { ascending: true })
          .range(from, to),
    );
    if (parksLoadErr) throw parksLoadErr;

    const parkRows = existingParks;

    const parkIdByKey = new Map<string, number>();
    const parkIdByExternalQid = new Map<string, number>();
    const parkIdByUnknownExternal = new Map<string, number>();
    for (const p of parkRows) {
      parkIdByKey.set(parkGroupKey(p.name, p.country), p.id);
      if (p.external_source === "wikidata" && p.external_id) {
        parkIdByExternalQid.set(p.external_id.trim().toUpperCase(), p.id);
      } else if (p.external_source === "wikidata_unknown_park" && p.external_id) {
        parkIdByUnknownExternal.set(p.external_id.trim().toLowerCase(), p.id);
      }
    }

    let parkUpdates = 0;
    let coasterUpdates = 0;

    const coasterBatch: ReturnType<typeof coasterUpsertPayload>[] = [];

    async function flushCoasters() {
      if (!coasterBatch.length) return;
      const chunk = coasterBatch.splice(0, UPSERT_CHUNK);
      await upsertCoastersByExternalKeys(
        supabase,
        chunk as unknown as Record<string, unknown>[],
      );
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
      const parkQid = majorityParkWikidataId(groupRows);
      const syncLng = normalizeSyncParkLongitude(centroid.lat, centroid.lng, country);
      const syncCentroid = { lat: centroid.lat, lng: syncLng };

      let parkId = parkIdByKey.get(gKey);
      if (!parkId && parkQid) {
        parkId = parkIdByExternalQid.get(parkQid);
        if (parkId) parkIdByKey.set(gKey, parkId);
      }

      if (!parkId) {
        const linked = findParkMatchByNameAndLocation(
          parkRows,
          parkName,
          syncCentroid.lat,
          syncCentroid.lng,
          32,
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
            latitude: syncCentroid.lat,
            longitude: syncCentroid.lng,
            external_source: "wikidata",
            external_id: parkQid,
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
          latitude: syncCentroid.lat,
          longitude: syncCentroid.lng,
          external_source: "wikidata",
          external_id: parkQid,
        });
        if (parkQid) parkIdByExternalQid.set(parkQid, parkId);
        parkUpdates += 1;
      } else {
        const row = parkRows.find((p) => p.id === parkId);
        const updateRes = await supabase
          .from("parks")
          .update({
            country,
            latitude: syncCentroid.lat,
            longitude: syncCentroid.lng,
            external_source: "wikidata",
            ...(parkQid ? { external_id: parkQid } : {}),
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", parkId);
        if (updateRes.error) throw updateRes.error;
        if (row) {
          row.country = country;
          row.latitude = syncCentroid.lat;
          row.longitude = syncCentroid.lng;
          row.external_source = "wikidata";
          if (parkQid) row.external_id = parkQid;
        }
        if (parkQid) parkIdByExternalQid.set(parkQid, parkId);
        parkUpdates += 1;
      }

      for (const wd of groupRows) {
        if (shouldSkipWikidataCoasterId(wd.wikidataId)) continue;
        const overrideName = COASTER_PARK_OVERRIDE_BY_WIKIDATA_ID[wd.wikidataId.trim().toUpperCase()];
        const overrideParkId = overrideName
          ? findParkIdByPreferredName(parkRows, overrideName)
          : null;
        const targetParkId = overrideParkId ?? parkId;
        coasterBatch.push(coasterUpsertPayload(wd, targetParkId));
        if (coasterBatch.length >= UPSERT_CHUNK) await flushCoasters();
      }
    }

    // Rows with no park label (common on Wikidata) still have coords — snap to nearest resort.
    const missingParkLabel = merged.filter(
      (r) =>
        !r.parkLabel?.trim() &&
        r.latitude != null &&
        r.longitude != null &&
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude),
    );
    for (const wd of missingParkLabel) {
      if (shouldSkipWikidataCoasterId(wd.wikidataId)) continue;
      const overrideName = COASTER_PARK_OVERRIDE_BY_WIKIDATA_ID[wd.wikidataId.trim().toUpperCase()];
      const overrideParkId = overrideName
        ? findParkIdByPreferredName(parkRows, overrideName)
        : null;
      if (overrideParkId) {
        coasterBatch.push(coasterUpsertPayload(wd, overrideParkId));
        if (coasterBatch.length >= UPSERT_CHUNK) await flushCoasters();
        continue;
      }

      const snapLng = normalizeSyncParkLongitude(wd.latitude!, wd.longitude!, wd.countryLabel);
      const landParks = parkRows.filter((p) => !isLikelyWaterParkName(p.name));
      const linked = findNearestParkForCoords(
        landParks,
        wd.latitude!,
        snapLng,
        4,
        wd.countryLabel,
      );
      if (linked) {
        coasterBatch.push(coasterUpsertPayload(wd, linked.id));
        if (coasterBatch.length >= UPSERT_CHUNK) await flushCoasters();
        continue;
      }

      const unknownExt = unknownParkExternalIdForRow(wd);
      if (!unknownExt) continue;
      let unknownParkId = parkIdByUnknownExternal.get(unknownExt.toLowerCase());
      if (!unknownParkId) {
        const unknownName = unknownParkNameForRow(wd);
        const unknownCountry = reconcileCountryWithCoords(
          wd.countryLabel ?? null,
          wd.latitude!,
          wd.longitude!,
        );
        const insertRes = await supabase
          .from("parks")
          .insert({
            name: unknownName,
            country: unknownCountry,
            latitude: wd.latitude!,
            longitude: snapLng,
            external_source: "wikidata_unknown_park",
            external_id: unknownExt,
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insertRes.error) throw insertRes.error;
        unknownParkId = insertRes.data.id as number;
        parkIdByUnknownExternal.set(unknownExt.toLowerCase(), unknownParkId);
        parkRows.push({
          id: unknownParkId,
          name: unknownName,
          country: unknownCountry,
          latitude: wd.latitude!,
          longitude: snapLng,
          external_source: "wikidata_unknown_park",
          external_id: unknownExt,
        });
        parkUpdates += 1;
      }
      coasterBatch.push(coasterUpsertPayload(wd, unknownParkId));
      if (coasterBatch.length >= UPSERT_CHUNK) await flushCoasters();
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
