/**
 * Deterministic post-sync catalog repairs — safe to run unattended after Wikidata publish.
 * Applies known coaster fixes, park coordinate normalization, park override relinks,
 * former-name stub merges, and clears cross-park Wikipedia pollution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import {
  COASTER_PARK_OVERRIDE_BY_WIKIDATA_ID,
  ENSURE_PARKS,
  PARK_COUNTRY_BY_NAME,
  PARK_DISPLAY_NAME_BY_EXACT_NAME,
  PARK_DISPLAY_NAME_BY_WIKIDATA_ID,
  type EnsureParkSpec,
} from "@/lib/catalog-overrides";
import {
  aliasKeysForStubMerge,
  findFormerNameStubMerges,
} from "@/lib/catalog-stub-merge";
import { effectiveClosingYear } from "@/lib/coaster-status";
import type { DbAliasRow } from "@/lib/data-platform/coaster-aliases";
import { canonicalCountryLabel, normalizeParkLongitude, reconcileCountryWithCoords } from "@/lib/geo-country";
import { parkNamesMatch } from "@/lib/park-match";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";
import {
  isAcceptableCoasterWikipediaMatch,
  isLikelyWikipediaDerivedImageUrl,
} from "@/lib/wikipedia-summary";
import type { Coaster, Park } from "@/types/domain";

export type AutoRepairResult = {
  parksScanned: number;
  parksUpdated: number;
  coastersScanned: number;
  coastersUpdated: number;
  parkLinksUpdated: number;
  parksEnsured: number;
  stubsMerged: number;
  wikipediaBindingsCleared: number;
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
  "opening_year",
  "closing_year",
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

function preferredParkDisplayName(park: ParkRow): string | null {
  const qid = park.external_id?.match(/^Q\d+$/i)?.[0]?.toUpperCase();
  if (qid && PARK_DISPLAY_NAME_BY_WIKIDATA_ID[qid]) {
    return PARK_DISPLAY_NAME_BY_WIKIDATA_ID[qid]!;
  }
  return PARK_DISPLAY_NAME_BY_EXACT_NAME[park.name.trim()] ?? null;
}

function parkRepairPatch(park: ParkRow): Partial<ParkRow> | null {
  const lat = park.latitude;
  const lng = park.longitude;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const normalizedLng = normalizeParkLongitude(lat, lng, park.country);
  const nameOverride = PARK_COUNTRY_BY_NAME[park.name.trim()];
  const country =
    nameOverride ||
    reconcileCountryWithCoords(park.country, lat, normalizedLng) ||
    canonicalCountryLabel(park.country) ||
    park.country;
  const displayName = preferredParkDisplayName(park);

  const patch: Partial<ParkRow> = {};
  if (normalizedLng !== lng) patch.longitude = normalizedLng;
  if (country !== park.country) patch.country = country;
  if (displayName && displayName !== park.name) patch.name = displayName;
  return Object.keys(patch).length ? patch : null;
}

export function buildCoasterRepairPatch(coaster: CoasterRow): Partial<CoasterRow> | null {
  const swapped = detectSwappedHeightLength(coaster.height_ft, coaster.length_ft);
  const base = swapped
    ? { ...coaster, height_ft: swapped.height_ft, length_ft: swapped.length_ft }
    : coaster;
  const fixed = applyCoasterKnownFixes(base);
  const clearedClosing = effectiveClosingYear(fixed.opening_year, fixed.closing_year);
  const withYears =
    clearedClosing !== (fixed.closing_year ?? null)
      ? { ...fixed, closing_year: clearedClosing }
      : fixed;

  const patch: Partial<CoasterRow> = {};
  for (const field of COASTER_REPAIR_FIELDS) {
    const before = coaster[field];
    const after = withYears[field];
    // Allow null closing_year so prior-life retirement years can be cleared.
    if (after == null && field !== "closing_year") continue;
    if (before !== after) {
      (patch as Record<string, unknown>)[field] = after ?? null;
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
  let stubsMerged = 0;
  let wikipediaBindingsCleared = 0;

  const parksResult = await fetchAllPages<ParkRow>(SUPABASE_PAGE_SIZE, (from, to) =>
    supabase
      .from("parks")
      .select("id,name,country,latitude,longitude,external_source,external_id")
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (parksResult.error) throw new Error(parksResult.error.message);
  const parks = parksResult.data;
  const parkNameById = new Map(parks.map((p) => [p.id, p.name]));

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
    parkNameById.set(id, spec.name);
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
      if (patch.name) parkNameById.set(park.id, patch.name);
    }
  }

  const coastersResult = await fetchAllPages<CoasterRow>(SUPABASE_PAGE_SIZE, (from, to) =>
    supabase
      .from("coasters")
      .select(
        "id,park_id,name,wikidata_id,coaster_type,manufacturer,status,image_url,height_ft,speed_mph,length_ft,inversions,duration_s,opening_year,closing_year,enwiki_title,summary_text",
      )
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (coastersResult.error) throw new Error(coastersResult.error.message);
  const coasters = coastersResult.data;

  for (const coaster of coasters) {
    const patch = buildCoasterRepairPatch(coaster);
    if (!patch) continue;
    coastersUpdated += 1;
    details.push(`coaster ${coaster.name} (${coaster.id}): ${Object.keys(patch).join(", ")}`);
    if (!dryRun) {
      const { error } = await supabase
        .from("coasters")
        .update({ ...patch, last_synced_at: nowIso() })
        .eq("id", coaster.id);
      if (error) throw error;
      Object.assign(coaster, patch);
    }
  }

  // Clear Wikipedia bindings that name a competing park / multi-park series.
  for (const coaster of coasters) {
    const extract = coaster.summary_text?.trim();
    const title = coaster.enwiki_title?.trim();
    if (!extract || extract.length < 40 || !title) continue;
    const parkName = parkNameById.get(coaster.park_id);
    if (!parkName) continue;
    const ok = isAcceptableCoasterWikipediaMatch(
      coaster.name,
      { title, extract, url: "", imageUrl: null },
      parkName,
    );
    if (ok) continue;
    wikipediaBindingsCleared += 1;
    details.push(
      `clear wiki ${coaster.name} (${coaster.id}): rejected "${title}" for park ${parkName}`,
    );
    if (!dryRun) {
      const clearImage = isLikelyWikipediaDerivedImageUrl(coaster.image_url);
      const { error } = await supabase
        .from("coasters")
        .update({
          enwiki_title: null,
          summary_text: null,
          ...(clearImage ? { image_url: null } : {}),
          last_synced_at: nowIso(),
        })
        .eq("id", coaster.id);
      if (error) throw error;
      coaster.enwiki_title = null;
      coaster.summary_text = null;
      if (clearImage) coaster.image_url = null;
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
        .update({ park_id: targetParkId, last_synced_at: nowIso() })
        .eq("id", coaster.id);
      if (error) throw error;
      coaster.park_id = targetParkId;
    }
  }

  const aliasResult = await supabase
    .from("data_coaster_name_aliases")
    .select("key_a,key_b,park_id,approved")
    .eq("approved", true);
  const aliasRows = (aliasResult.data ?? []) as DbAliasRow[];
  if (aliasResult.error) {
    details.push(`alias load warning: ${aliasResult.error.message}`);
  }

  const merges = findFormerNameStubMerges(coasters, aliasRows);
  for (const merge of merges) {
    stubsMerged += 1;
    details.push(
      `merge stub ${merge.stubName} (#${merge.stubId}) → ${merge.keepName} (#${merge.keepId}) [${merge.reason}]`,
    );
    if (dryRun) continue;
    await mergeCoasterStubIntoKeep(supabase, merge.stubId, merge.keepId);

    const aliasKeys = aliasKeysForStubMerge(merge.stubName, merge.keepName);
    if (aliasKeys) {
      const { data: existingAlias } = await supabase
        .from("data_coaster_name_aliases")
        .select("key_a")
        .eq("key_a", aliasKeys.key_a)
        .eq("key_b", aliasKeys.key_b)
        .eq("park_id", merge.parkId)
        .maybeSingle();
      if (!existingAlias) {
        await supabase.from("data_coaster_name_aliases").insert({
          key_a: aliasKeys.key_a,
          key_b: aliasKeys.key_b,
          park_id: merge.parkId,
          source: "auto_repair",
          approved: true,
        });
      }
    }

    // Drop stub from in-memory list so later steps don't touch it.
    const idx = coasters.findIndex((c) => c.id === merge.stubId);
    if (idx >= 0) coasters.splice(idx, 1);
  }

  return {
    parksScanned: parks.length,
    parksUpdated,
    coastersScanned: coasters.length + stubsMerged,
    coastersUpdated,
    parkLinksUpdated,
    parksEnsured,
    stubsMerged,
    wikipediaBindingsCleared,
    details,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Remap user credits / links from stub → keep, then delete the stub row. */
async function mergeCoasterStubIntoKeep(
  supabase: SupabaseClient,
  stubId: number,
  keepId: number,
): Promise<void> {
  const { data: stubEvents, error: stubEvErr } = await supabase
    .from("ride_events")
    .select("id,user_id,ridden_on,quantity")
    .eq("coaster_id", stubId);
  if (stubEvErr) throw stubEvErr;

  for (const stub of stubEvents ?? []) {
    const { data: keepEvents, error: keepEvErr } = await supabase
      .from("ride_events")
      .select("id,ridden_on,quantity")
      .eq("user_id", stub.user_id)
      .eq("coaster_id", keepId);
    if (keepEvErr) throw keepEvErr;

    const keepRow = (keepEvents ?? []).find((k) =>
      stub.ridden_on == null ? k.ridden_on == null : k.ridden_on === stub.ridden_on,
    );

    if (keepRow) {
      const nextQty = Math.min(99, Number(keepRow.quantity ?? 1) + Number(stub.quantity ?? 1));
      const { error } = await supabase
        .from("ride_events")
        .update({ quantity: nextQty })
        .eq("id", keepRow.id);
      if (error) throw error;
      const { error: delErr } = await supabase.from("ride_events").delete().eq("id", stub.id);
      if (delErr) throw delErr;
    } else {
      const { error } = await supabase
        .from("ride_events")
        .update({ coaster_id: keepId })
        .eq("id", stub.id);
      if (error) throw error;
    }
  }

  const { data: stubRides, error: stubRideErr } = await supabase
    .from("rides")
    .select("id,user_id")
    .eq("coaster_id", stubId);
  if (stubRideErr) throw stubRideErr;
  for (const ride of stubRides ?? []) {
    const { data: existing } = await supabase
      .from("rides")
      .select("id")
      .eq("user_id", ride.user_id)
      .eq("coaster_id", keepId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("rides").delete().eq("id", ride.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("rides").update({ coaster_id: keepId }).eq("id", ride.id);
      if (error) throw error;
    }
  }

  const { data: stubWish, error: wishErr } = await supabase
    .from("wishlist")
    .select("id,user_id")
    .eq("coaster_id", stubId);
  if (wishErr) throw wishErr;
  for (const w of stubWish ?? []) {
    const { data: existing } = await supabase
      .from("wishlist")
      .select("id")
      .eq("user_id", w.user_id)
      .eq("coaster_id", keepId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("wishlist").delete().eq("id", w.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("wishlist").update({ coaster_id: keepId }).eq("id", w.id);
      if (error) throw error;
    }
  }

  await supabase.from("profiles").update({ favorite_ride_id: keepId }).eq("favorite_ride_id", stubId);

  const { data: stubLinks } = await supabase
    .from("data_coaster_source_links")
    .select("id,source")
    .eq("coaster_id", stubId);
  for (const link of stubLinks ?? []) {
    const { data: existing } = await supabase
      .from("data_coaster_source_links")
      .select("id")
      .eq("coaster_id", keepId)
      .eq("source", link.source)
      .maybeSingle();
    if (existing) {
      await supabase.from("data_coaster_source_links").delete().eq("id", link.id);
    } else {
      await supabase
        .from("data_coaster_source_links")
        .update({ coaster_id: keepId })
        .eq("id", link.id);
    }
  }

  await supabase
    .from("data_review_findings")
    .update({ coaster_id: keepId })
    .eq("coaster_id", stubId);

  const { error: delCoasterErr } = await supabase.from("coasters").delete().eq("id", stubId);
  if (delCoasterErr) throw delCoasterErr;
}
