/**
 * Deterministic post-sync catalog repairs — safe to run unattended after Wikidata publish.
 * Applies known coaster fixes, park coordinate normalization, and park override relinks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import {
  COASTER_PARK_OVERRIDE_BY_WIKIDATA_ID,
  ENSURE_PARKS,
  type EnsureParkSpec,
} from "@/lib/catalog-overrides";
import { canonicalCountryLabel, normalizeParkLongitude, reconcileCountryWithCoords } from "@/lib/geo-country";
import { parkNamesMatch } from "@/lib/park-match";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";
import type { Coaster, Park } from "@/types/domain";

export type AutoRepairResult = {
  parksScanned: number;
  parksUpdated: number;
  coastersScanned: number;
  coastersUpdated: number;
  parkLinksUpdated: number;
  parksEnsured: number;
  details: string[];
};

type ParkRow = Park & {
  external_source?: string | null;
  external_id?: string | null;
};

type CoasterRow = Coaster;

const COASTER_REPAIR_FIELDS = [
  "name",
  "coaster_type",
  "manufacturer",
  "status",
  "image_url",
  "height_ft",
  "speed_mph",
  "length_ft",
  "inversions",
  "duration_s",
] as const;

/** Detect obvious height/length swaps (e.g. 1486 ft height, 63 ft length). */
export function detectSwappedHeightLength(
  heightFt: number | null | undefined,
  lengthFt: number | null | undefined,
): { height_ft: number; length_ft: number } | null {
  if (heightFt == null || lengthFt == null) return null;
  if (!Number.isFinite(heightFt) || !Number.isFinite(lengthFt)) return null;
  if (heightFt > 400 && lengthFt < 200 && heightFt / lengthFt > 4) {
    return { height_ft: Math.round(lengthFt), length_ft: Math.round(heightFt) };
  }
  return null;
}

function findParkIdByPreferredName(parks: ParkRow[], preferredName: string): number | null {
  const want = preferredName.trim().toLowerCase();
  const exact = parks.find((p) => p.name.trim().toLowerCase() === want);
  if (exact) return exact.id;
  const fuzzy = parks.find((p) => parkNamesMatch(p.name, preferredName));
  return fuzzy?.id ?? null;
}

function parkRepairPatch(park: ParkRow): Partial<ParkRow> | null {
  const lat = park.latitude;
  const lng = park.longitude;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const normalizedLng = normalizeParkLongitude(lat, lng, park.country);
  const country =
    reconcileCountryWithCoords(park.country, lat, normalizedLng) ||
    canonicalCountryLabel(park.country) ||
    park.country;

  const patch: Partial<ParkRow> = {};
  if (normalizedLng !== lng) patch.longitude = normalizedLng;
  if (country !== park.country) patch.country = country;
  return Object.keys(patch).length ? patch : null;
}

function coasterRepairPatch(coaster: CoasterRow): Partial<CoasterRow> | null {
  const swapped = detectSwappedHeightLength(coaster.height_ft, coaster.length_ft);
  const base = swapped
    ? { ...coaster, height_ft: swapped.height_ft, length_ft: swapped.length_ft }
    : coaster;
  const fixed = applyCoasterKnownFixes(base);

  const patch: Partial<CoasterRow> = {};
  for (const field of COASTER_REPAIR_FIELDS) {
    const before = coaster[field];
    const after = fixed[field];
    if (after == null) continue;
    if (before !== after) {
      (patch as Record<string, unknown>)[field] = after;
    }
  }
  return Object.keys(patch).length ? patch : null;
}

async function ensurePark(supabase: SupabaseClient, spec: EnsureParkSpec): Promise<number> {
  if (spec.external_source && spec.external_id) {
    const { data: existing } = await supabase
      .from("parks")
      .select("id")
      .eq("external_source", spec.external_source)
      .eq("external_id", spec.external_id)
      .maybeSingle();
    if (existing) return existing.id;
  }

  const { data: byName } = await supabase
    .from("parks")
    .select("id")
    .ilike("name", spec.name)
    .eq("country", spec.country)
    .maybeSingle();
  if (byName) return byName.id;

  const insert: Record<string, unknown> = {
    name: spec.name,
    country: spec.country,
    latitude: spec.latitude,
    longitude: spec.longitude,
    last_synced_at: new Date().toISOString(),
  };
  if (spec.external_source && spec.external_id) {
    insert.external_source = spec.external_source;
    insert.external_id = spec.external_id;
  }
  const { data: inserted, error } = await supabase.from("parks").insert(insert).select("id").single();
  if (error) throw error;
  return inserted.id;
}

export async function applyCatalogAutoRepairs(
  supabase: SupabaseClient,
  options: { dryRun?: boolean } = {},
): Promise<AutoRepairResult> {
  const dryRun = options.dryRun === true;
  const details: string[] = [];
  let parksUpdated = 0;
  let coastersUpdated = 0;
  let parkLinksUpdated = 0;
  let parksEnsured = 0;

  const parksResult = await fetchAllPages<ParkRow>(SUPABASE_PAGE_SIZE, (from, to) =>
    supabase
      .from("parks")
      .select("id,name,country,latitude,longitude,external_source,external_id")
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (parksResult.error) throw new Error(parksResult.error.message);
  const parks = parksResult.data;

  for (const spec of ENSURE_PARKS) {
    const existingId = findParkIdByPreferredName(parks, spec.name);
    if (existingId) continue;
    if (dryRun) {
      details.push(`would ensure park: ${spec.name}`);
      parksEnsured += 1;
      continue;
    }
    const id = await ensurePark(supabase, spec);
    parks.push({
      id,
      name: spec.name,
      country: spec.country,
      latitude: spec.latitude,
      longitude: spec.longitude,
      external_source: spec.external_source ?? null,
      external_id: spec.external_id ?? null,
    });
    parksEnsured += 1;
    details.push(`ensured park: ${spec.name} (id=${id})`);
  }

  for (const park of parks) {
    const patch = parkRepairPatch(park);
    if (!patch) continue;
    parksUpdated += 1;
    details.push(
      `park ${park.name} (${park.id}): ${Object.entries(patch)
        .map(([k, v]) => `${k}→${v}`)
        .join(", ")}`,
    );
    if (!dryRun) {
      const { error } = await supabase
        .from("parks")
        .update({ ...patch, last_synced_at: new Date().toISOString() })
        .eq("id", park.id);
      if (error) throw error;
      Object.assign(park, patch);
    }
  }

  const coastersResult = await fetchAllPages<CoasterRow>(SUPABASE_PAGE_SIZE, (from, to) =>
    supabase
      .from("coasters")
      .select(
        "id,park_id,name,wikidata_id,coaster_type,manufacturer,status,image_url,height_ft,speed_mph,length_ft,inversions,duration_s",
      )
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (coastersResult.error) throw new Error(coastersResult.error.message);
  const coasters = coastersResult.data;

  for (const coaster of coasters) {
    const patch = coasterRepairPatch(coaster);
    if (!patch) continue;
    coastersUpdated += 1;
    details.push(`coaster ${coaster.name} (${coaster.id}): ${Object.keys(patch).join(", ")}`);
    if (!dryRun) {
      const { error } = await supabase
        .from("coasters")
        .update({ ...patch, last_synced_at: new Date().toISOString() })
        .eq("id", coaster.id);
      if (error) throw error;
      Object.assign(coaster, patch);
    }
  }

  for (const [qid, parkName] of Object.entries(COASTER_PARK_OVERRIDE_BY_WIKIDATA_ID)) {
    const targetParkId = findParkIdByPreferredName(parks, parkName);
    if (!targetParkId) {
      details.push(`skip link ${qid}: park "${parkName}" not found`);
      continue;
    }
    const coaster = coasters.find((c) => c.wikidata_id?.trim().toUpperCase() === qid);
    if (!coaster || coaster.park_id === targetParkId) continue;
    parkLinksUpdated += 1;
    details.push(`link ${coaster.name} (${qid}): park_id ${coaster.park_id}→${targetParkId}`);
    if (!dryRun) {
      const { error } = await supabase
        .from("coasters")
        .update({ park_id: targetParkId, last_synced_at: new Date().toISOString() })
        .eq("id", coaster.id);
      if (error) throw error;
    }
  }

  return {
    parksScanned: parks.length,
    parksUpdated,
    coastersScanned: coasters.length,
    coastersUpdated,
    parkLinksUpdated,
    parksEnsured,
    details,
  };
}
