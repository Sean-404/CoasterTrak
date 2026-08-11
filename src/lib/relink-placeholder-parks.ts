/**
 * Shared helpers to move coasters off placeholder parks ("Other", Unknown / historical…)
 * onto real parks using Wikidata park labels.
 */

import { normalizeCoasterDedupKey } from "@/lib/coaster-dedup";
import {
  findNearestParkForCoords,
  isCatalogHiddenParkName,
  isLikelyWaterParkName,
  parkNamesMatch,
  type ParkForMatch,
} from "@/lib/park-match";
import { haversineKm } from "@/lib/geo";
import { reconcileCountryWithCoords } from "@/lib/geo-country";
import { normalizeNameKey, type WikidataCoasterRow } from "@/lib/wikidata-coasters";

export type RelinkPark = ParkForMatch & {
  external_source?: string | null;
  external_id?: string | null;
};

export type RelinkCoaster = {
  id: number;
  name: string;
  park_id: number;
  wikidata_id: string | null;
  external_source?: string | null;
  external_id?: string | null;
  manufacturer?: string | null;
  length_ft?: number | null;
  speed_mph?: number | null;
  height_ft?: number | null;
  inversions?: number | null;
  duration_s?: number | null;
  image_url?: string | null;
  status?: string | null;
  coaster_type?: string | null;
  opening_year?: number | null;
  closing_year?: number | null;
  enwiki_title?: string | null;
  summary_text?: string | null;
};

export type RelinkPlan =
  | {
      action: "move";
      coasterId: number;
      coasterName: string;
      fromParkId: number;
      fromParkName: string;
      toParkId: number;
      toParkName: string;
      reason: string;
    }
  | {
      action: "merge";
      keepId: number;
      dropId: number;
      coasterName: string;
      fromParkId: number;
      fromParkName: string;
      toParkId: number;
      toParkName: string;
      reason: string;
    }
  | {
      action: "skip";
      coasterId: number;
      coasterName: string;
      fromParkId: number;
      fromParkName: string;
      reason: string;
    };

function countryAligned(wdCountry: string | null | undefined, park: RelinkPark): boolean {
  if (!wdCountry?.trim()) return true;
  const w = wdCountry.trim().toLowerCase();
  const resolved = reconcileCountryWithCoords(park.country, park.latitude, park.longitude)
    .trim()
    .toLowerCase();
  if (!resolved || resolved === "unknown") return true;
  return w === resolved || w.includes(resolved) || resolved.includes(w);
}

/** Resolve a real DB park for a Wikidata row's park label / Q-id / coords. */
export function resolveParkForWikidataRow(
  wd: Pick<WikidataCoasterRow, "parkLabel" | "parkWikidataId" | "countryLabel" | "latitude" | "longitude">,
  parks: RelinkPark[],
): RelinkPark | null {
  const realParks = parks.filter(
    (p) => !isCatalogHiddenParkName(p.name) && !isLikelyWaterParkName(p.name),
  );

  const parkQid = wd.parkWikidataId?.trim().toUpperCase();
  if (parkQid) {
    const byQid = realParks.find(
      (p) =>
        p.external_source === "wikidata" &&
        p.external_id?.trim().toUpperCase() === parkQid,
    );
    if (byQid) return byQid;
  }

  const label = wd.parkLabel?.trim();
  if (label && !isCatalogHiddenParkName(label)) {
    const exact = realParks.find((p) => p.name.trim().toLowerCase() === label.toLowerCase());
    if (exact) return exact;

    const matches = realParks.filter((p) => parkNamesMatch(label, p.name));
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      const lat = wd.latitude ?? null;
      const lon = wd.longitude ?? null;
      if (lat != null && lon != null) {
        let best: RelinkPark | null = null;
        let bestD = Infinity;
        for (const p of matches) {
          if (p.latitude == null || p.longitude == null) continue;
          if (!countryAligned(wd.countryLabel, p)) continue;
          const d = haversineKm(lat, lon, p.latitude, p.longitude);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        if (best) return best;
      }

      const byCountry = matches.filter((p) => countryAligned(wd.countryLabel, p));
      if (byCountry.length === 1) return byCountry[0]!;
    }
  }

  // No usable park label (common on Wikidata) — snap tightly by ride coordinates.
  // Keep this small: a 35 km UK radius wrongly parked Camelot's Knightmare at Blackpool.
  if (
    wd.latitude != null &&
    wd.longitude != null &&
    Number.isFinite(wd.latitude) &&
    Number.isFinite(wd.longitude)
  ) {
    return findNearestParkForCoords(
      realParks,
      wd.latitude,
      wd.longitude,
      8,
      wd.countryLabel,
    );
  }

  return null;
}

function sameRideName(a: string, b: string): boolean {
  const ka = normalizeCoasterDedupKey(a);
  const kb = normalizeCoasterDedupKey(b);
  if (ka && kb && ka === kb) return true;
  const na = normalizeNameKey(a);
  const nb = normalizeNameKey(b);
  return Boolean(na && nb && na === nb);
}

function richness(c: RelinkCoaster): number {
  let score = 0;
  if (c.wikidata_id) score += 5;
  if (c.image_url) score += 1;
  if (c.manufacturer) score += 1;
  if (c.length_ft != null) score += 1;
  if (c.speed_mph != null) score += 1;
  if (c.height_ft != null) score += 1;
  if (c.inversions != null) score += 1;
  if (c.duration_s != null) score += 1;
  if (c.enwiki_title) score += 1;
  if (c.summary_text) score += 1;
  return score;
}

/**
 * Plan how to move placeholder-park coasters onto real parks using a Wikidata snapshot.
 */
export function planPlaceholderParkRelinks(opts: {
  parks: RelinkPark[];
  coasters: RelinkCoaster[];
  wdByQid: Map<string, WikidataCoasterRow>;
}): RelinkPlan[] {
  const parkById = new Map(opts.parks.map((p) => [p.id, p]));
  const coastersByPark = new Map<number, RelinkCoaster[]>();
  for (const c of opts.coasters) {
    const list = coastersByPark.get(c.park_id) ?? [];
    list.push(c);
    coastersByPark.set(c.park_id, list);
  }

  const plans: RelinkPlan[] = [];

  for (const c of opts.coasters) {
    const fromPark = parkById.get(c.park_id);
    if (!fromPark || !isCatalogHiddenParkName(fromPark.name)) continue;

    const qid = c.wikidata_id?.trim().toUpperCase() ?? "";
    const wd = qid ? opts.wdByQid.get(qid) : undefined;

    if (!wd) {
      plans.push({
        action: "skip",
        coasterId: c.id,
        coasterName: c.name,
        fromParkId: fromPark.id,
        fromParkName: fromPark.name,
        reason: qid ? "wikidata id not in snapshot" : "no wikidata id",
      });
      continue;
    }

    const target = resolveParkForWikidataRow(wd, opts.parks);
    if (!target) {
      plans.push({
        action: "skip",
        coasterId: c.id,
        coasterName: c.name,
        fromParkId: fromPark.id,
        fromParkName: fromPark.name,
        reason: wd.parkLabel?.trim()
          ? `no DB park for WD label "${wd.parkLabel}"`
          : "no park label or nearby DB park for WD coords",
      });
      continue;
    }

    if (target.id === fromPark.id) {
      plans.push({
        action: "skip",
        coasterId: c.id,
        coasterName: c.name,
        fromParkId: fromPark.id,
        fromParkName: fromPark.name,
        reason: "already on resolved park",
      });
      continue;
    }

    const atTarget = (coastersByPark.get(target.id) ?? []).filter((other) =>
      sameRideName(other.name, c.name),
    );

    if (atTarget.length === 0) {
      plans.push({
        action: "move",
        coasterId: c.id,
        coasterName: c.name,
        fromParkId: fromPark.id,
        fromParkName: fromPark.name,
        toParkId: target.id,
        toParkName: target.name,
        reason: `WD parkLabel "${wd.parkLabel}"`,
      });
      continue;
    }

    // Prefer keeping the richer row; drop the twin at the target (usually a null-WD stub).
    const stub = atTarget[0]!;
    const keepPlaceholder = richness(c) >= richness(stub);
    const keepId = keepPlaceholder ? c.id : stub.id;
    const dropId = keepPlaceholder ? stub.id : c.id;

    plans.push({
      action: "merge",
      keepId,
      dropId,
      coasterName: c.name,
      fromParkId: fromPark.id,
      fromParkName: fromPark.name,
      toParkId: target.id,
      toParkName: target.name,
      reason: keepPlaceholder
        ? `merge stub #${stub.id} into enriched #${c.id}, then move to ${target.name}`
        : `merge enriched #${c.id} into stub #${stub.id} at ${target.name}`,
    });
  }

  return plans;
}

/** Fields to copy from a rich placeholder row onto a keep row during merge. */
export function mergeCoasterFields(
  keep: RelinkCoaster,
  donor: RelinkCoaster,
): Partial<RelinkCoaster> {
  const pick = <T>(a: T | null | undefined, b: T | null | undefined): T | null | undefined =>
    a != null && a !== "" ? a : b;

  return {
    wikidata_id: pick(keep.wikidata_id, donor.wikidata_id) ?? null,
    external_source: pick(keep.external_source, donor.external_source) ?? null,
    external_id: pick(keep.external_id, donor.external_id) ?? null,
    manufacturer: pick(keep.manufacturer, donor.manufacturer) ?? null,
    length_ft: pick(keep.length_ft, donor.length_ft) ?? null,
    speed_mph: pick(keep.speed_mph, donor.speed_mph) ?? null,
    height_ft: pick(keep.height_ft, donor.height_ft) ?? null,
    inversions: pick(keep.inversions, donor.inversions) ?? null,
    duration_s: pick(keep.duration_s, donor.duration_s) ?? null,
    image_url: pick(keep.image_url, donor.image_url) ?? null,
    status: pick(keep.status, donor.status) ?? null,
    coaster_type:
      keep.coaster_type && keep.coaster_type !== "Unknown"
        ? keep.coaster_type
        : (donor.coaster_type ?? keep.coaster_type ?? null),
    opening_year: pick(keep.opening_year, donor.opening_year) ?? null,
    closing_year: pick(keep.closing_year, donor.closing_year) ?? null,
    enwiki_title: pick(keep.enwiki_title, donor.enwiki_title) ?? null,
    summary_text: pick(keep.summary_text, donor.summary_text) ?? null,
  };
}
