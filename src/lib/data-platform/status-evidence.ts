/**
 * Evidence for catalog rows whose lifecycle status is not confirmed ("Unknown").
 *
 * Sources and what they are allowed to prove:
 * - ThemeParks.wiki: an ATTRACTION entity in a linked park's current feed means the ride is
 *   in the park's current lineup (not that it opens today). A strong name match can become a
 *   proposed `status = Operating` override after owner approval. Absence from a feed that
 *   otherwise covers the park is only a defunct *candidate* for review — never applied.
 * - OpenStreetMap (Overpass): cross-check only. OSM data is ODbL, so nothing from it is ever
 *   turned into an override or copied into the public catalog by this module.
 */

import type { ThemeParksChildEntity } from "../themeparks-wiki";
import { haversineKm } from "../geo";
import type { AliasLookup } from "./coaster-aliases";
import { matchParkCoastersToThemeParks, type CatalogCoasterRow } from "./themeparks-match";

export const THEMEPARKS_ENTITY_URL = "https://api.themeparks.wiki/v1/entity";

export type Lifecycle = "Operating" | "Defunct" | "Unknown";

export type EvidencePark = {
  id: number;
  name: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type EvidenceCoaster = {
  id: number;
  park_id: number;
  name: string;
  status: string;
  lifecycle: Lifecycle;
  wikidata_id: string | null;
  opening_year: number | null;
  closing_year: number | null;
};

type LatLon = { latitude: number; longitude: number };

function toMatcherRows(coasters: EvidenceCoaster[]): CatalogCoasterRow[] {
  // The matcher ranks by raw status; feeding the lifecycle keeps Operating rows first,
  // so a name already claimed by a confirmed ride is never re-used for an Unknown one.
  return coasters.map((c) => ({
    id: c.id,
    park_id: c.park_id,
    name: c.name,
    status: c.lifecycle,
    coaster_type: null,
    wikidata_id: c.wikidata_id,
  }));
}

function matcherPark(park: EvidencePark) {
  return {
    id: park.id,
    name: park.name,
    country: park.country,
    latitude: park.latitude,
    longitude: park.longitude,
  };
}

// ---------------------------------------------------------------------------
// ThemeParks.wiki
// ---------------------------------------------------------------------------

export type ThemeParksLive = { status: string | null; lastUpdated: string | null };

export type ThemeParksCoverage = {
  attractionCount: number;
  knownOperating: number;
  matchedKnownOperating: number;
  covered: boolean;
  reason: string;
};

/** Minimum share of confirmed-operating catalog rides the feed must contain before absence means anything. */
export const COVERAGE_MIN_SHARE = 0.6;
export const COVERAGE_MIN_ATTRACTIONS = 5;

export function themeParksCoverage(
  attractionCount: number,
  knownOperating: number,
  matchedKnownOperating: number,
): ThemeParksCoverage {
  const base = { attractionCount, knownOperating, matchedKnownOperating };
  if (attractionCount < COVERAGE_MIN_ATTRACTIONS) {
    return { ...base, covered: false, reason: `feed lists only ${attractionCount} attractions` };
  }
  if (knownOperating === 0) {
    return { ...base, covered: false, reason: "no confirmed-operating rides to check the feed against" };
  }
  const share = matchedKnownOperating / knownOperating;
  if (share < COVERAGE_MIN_SHARE) {
    return {
      ...base,
      covered: false,
      reason: `feed contains ${matchedKnownOperating}/${knownOperating} confirmed-operating rides`,
    };
  }
  return {
    ...base,
    covered: true,
    reason: `feed contains ${matchedKnownOperating}/${knownOperating} confirmed-operating rides`,
  };
}

export type ThemeParksRowEvidence =
  | {
      kind: "present";
      coasterId: number;
      strength: "strong" | "weak";
      weakReasons: string[];
      entityId: string;
      entityName: string;
      entityUrl: string;
      matchMethod: string;
      confidence: number;
      location: LatLon | null;
      live: ThemeParksLive | null;
      fetchedAt: string;
      parkCovered: boolean;
    }
  | {
      kind: "absent";
      coasterId: number;
      fetchedAt: string;
      parkCovered: boolean;
      coverageReason: string;
    };

export type ThemeParksParkAssessment = {
  parkId: number;
  parkName: string;
  themeParksParkId: string;
  themeParksParkName: string;
  parkMatchMethod: string;
  parkMatchConfidence: number;
  feedUrl: string;
  fetchedAt: string;
  coverage: ThemeParksCoverage;
  rows: ThemeParksRowEvidence[];
  /** Coaster-looking feed entries with no catalog row (review only). */
  possibleMissing: Array<{ entityId: string; name: string }>;
  attractionIds: string[];
};

export function assessThemeParksPark(opts: {
  park: EvidencePark;
  coasters: EvidenceCoaster[];
  themeParksParkId: string;
  themeParksParkName: string;
  parkMatchMethod: string;
  parkMatchConfidence: number;
  attractions: ThemeParksChildEntity[];
  live: Map<string, ThemeParksLive>;
  fetchedAt: string;
  aliasLookup: AliasLookup;
}): ThemeParksParkAssessment {
  const { park, coasters, attractions, fetchedAt } = opts;
  const result = matchParkCoastersToThemeParks({
    park: matcherPark(park),
    coasters: toMatcherRows(coasters),
    themeParksParkId: opts.themeParksParkId,
    themeParksParkName: opts.themeParksParkName,
    parkMatchMethod: "auto",
    attractions,
    aliasLookup: opts.aliasLookup,
  });

  const byCoaster = new Map(result.matched.map((m) => [m.coasterId, m]));
  const attractionById = new Map(attractions.map((a) => [a.id, a]));
  const knownOperating = coasters.filter((c) => c.lifecycle === "Operating");
  const coverage = themeParksCoverage(
    attractions.length,
    knownOperating.length,
    knownOperating.filter((c) => byCoaster.has(c.id)).length,
  );

  const rows: ThemeParksRowEvidence[] = [];
  for (const coaster of coasters) {
    if (coaster.lifecycle !== "Unknown") continue;
    const m = byCoaster.get(coaster.id);
    if (!m) {
      rows.push({
        kind: "absent",
        coasterId: coaster.id,
        fetchedAt,
        parkCovered: coverage.covered,
        coverageReason: coverage.reason,
      });
      continue;
    }
    const weakReasons: string[] = [];
    if (m.matchMethod === "prefix" || m.matchMethod === "fuzzy") {
      weakReasons.push(`${m.matchMethod} name match (${m.confidence})`);
    }
    const entity = attractionById.get(m.themeParksId);
    const lat = entity?.location?.latitude;
    const lon = entity?.location?.longitude;
    rows.push({
      kind: "present",
      coasterId: coaster.id,
      strength: weakReasons.length ? "weak" : "strong",
      weakReasons,
      entityId: m.themeParksId,
      entityName: m.themeParksName,
      entityUrl: `${THEMEPARKS_ENTITY_URL}/${m.themeParksId}`,
      matchMethod: m.matchMethod,
      confidence: m.confidence,
      location: lat != null && lon != null ? { latitude: lat, longitude: lon } : null,
      live: opts.live.get(m.themeParksId) ?? null,
      fetchedAt,
      parkCovered: coverage.covered,
    });
  }

  return {
    parkId: park.id,
    parkName: park.name,
    themeParksParkId: opts.themeParksParkId,
    themeParksParkName: opts.themeParksParkName,
    parkMatchMethod: opts.parkMatchMethod,
    parkMatchConfidence: opts.parkMatchConfidence,
    feedUrl: `${THEMEPARKS_ENTITY_URL}/${opts.themeParksParkId}/children`,
    fetchedAt,
    coverage,
    rows,
    possibleMissing: result.sourceOnly
      .filter((s) => s.likelyCoaster)
      .map((s) => ({ entityId: s.themeParksId, name: s.themeParksName })),
    attractionIds: attractions.map((a) => a.id),
  };
}

/**
 * ThemeParks.wiki sometimes repeats one attraction UUID under several parks. A match on such
 * an entity says nothing about *this* park, so it is downgraded to weak.
 */
export function downgradeLeakedEntities(parks: ThemeParksParkAssessment[]): ThemeParksParkAssessment[] {
  const parksByEntity = new Map<string, Set<number>>();
  for (const p of parks) {
    for (const id of p.attractionIds) {
      const set = parksByEntity.get(id) ?? new Set<number>();
      set.add(p.parkId);
      parksByEntity.set(id, set);
    }
  }
  return parks.map((p) => ({
    ...p,
    rows: p.rows.map((row) => {
      if (row.kind !== "present" || (parksByEntity.get(row.entityId)?.size ?? 0) <= 1) return row;
      return {
        ...row,
        strength: "weak" as const,
        weakReasons: [...row.weakReasons, "entity id also appears under another park"],
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// OpenStreetMap (Overpass) — cross-check only
// ---------------------------------------------------------------------------

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
};

export type OsmParkGroup = { park: OsmElement; active: OsmElement[]; lifecycle: OsmElement[] };

export const OSM_LIFECYCLE_PREFIXES = ["disused", "abandoned", "removed", "demolished", "razed", "was"];

const PARK_TOURISM = new Set(["theme_park", "amusement_park"]);

export const OSM_PARK_SEARCH_RADIUS_M = 1500;

/**
 * One Overpass query for a batch of parks: theme-park polygons near each park point, then for
 * every polygon its named roller coasters and lifecycle-prefixed (removed/disused/…) ones.
 */
export function buildOverpassBatchQuery(points: LatLon[], radiusM = OSM_PARK_SEARCH_RADIUS_M): string {
  const around = points
    .map((p) => {
      const at = `(around:${radiusM},${p.latitude.toFixed(5)},${p.longitude.toFixed(5)})`;
      return `way["tourism"~"^(theme_park|amusement_park)$"]${at};relation["tourism"~"^(theme_park|amusement_park)$"]${at};`;
    })
    .join("");
  const lifecycle = OSM_LIFECYCLE_PREFIXES.map(
    (prefix) => `nwr(area.a)["${prefix}:attraction"="roller_coaster"];out tags center;`,
  ).join("");
  return (
    `[out:json][timeout:180];(${around})->.parks;` +
    `foreach.parks->.p(.p out tags center;.p map_to_area->.a;` +
    `nwr(area.a)["attraction"="roller_coaster"]["name"];out tags center;${lifecycle});`
  );
}

function isParkElement(el: OsmElement): boolean {
  return el.type !== "node" && PARK_TOURISM.has(el.tags?.tourism ?? "");
}

/** Overpass `foreach` output is flat: a park polygon followed by the features inside it. */
export function parseOverpassParkGroups(elements: OsmElement[]): OsmParkGroup[] {
  const groups = new Map<string, OsmParkGroup>();
  let current: OsmParkGroup | null = null;
  for (const el of elements) {
    if (isParkElement(el)) {
      const key = `${el.type}/${el.id}`;
      current = groups.get(key) ?? { park: el, active: [], lifecycle: [] };
      groups.set(key, current);
      continue;
    }
    if (!current) continue;
    const tags = el.tags ?? {};
    if (tags.attraction === "roller_coaster") current.active.push(el);
    else if (OSM_LIFECYCLE_PREFIXES.some((p) => tags[`${p}:attraction`] === "roller_coaster")) {
      current.lifecycle.push(el);
    }
  }
  return [...groups.values()];
}

export function osmElementPoint(el: OsmElement): LatLon | null {
  const lat = el.center?.lat ?? el.lat;
  const lon = el.center?.lon ?? el.lon;
  return lat != null && lon != null ? { latitude: lat, longitude: lon } : null;
}

/** Bigram similarity; one name containing the other ("Knoebels" / "Knoebels Amusement Resort") scores 0.9. */
export function parkNameScore(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const shorter = x.length <= y.length ? x : y;
  if (shorter.length >= 6 && (x.includes(y) || y.includes(x))) return 0.9;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) grams.set(x.slice(i, i + 2), (grams.get(x.slice(i, i + 2)) ?? 0) + 1);
  let hits = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const g = y.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      grams.set(g, n - 1);
      hits++;
    }
  }
  return (2 * hits) / (x.length - 1 + y.length - 1);
}

export type OsmParkChoice = { group: OsmParkGroup; nameScore: number; distanceKm: number; confident: boolean };

/** Max distance from the catalog park point to a candidate polygon's centre. */
const OSM_PARK_MAX_KM = 3;

/**
 * Pick the OSM polygon that is this catalog park: best name match among nearby polygons,
 * else the nearest one, flagged not confident. Neighbouring parks share radii (Adventure City
 * sits next to Disney California Adventure), so callers must not use a non-confident polygon
 * as evidence.
 */
export function chooseOsmParkGroup(groups: OsmParkGroup[], park: EvidencePark): OsmParkChoice | null {
  if (park.latitude == null || park.longitude == null) return null;
  const candidates = groups
    .map((group) => {
      const point = osmElementPoint(group.park);
      const distanceKm = point
        ? haversineKm(park.latitude!, park.longitude!, point.latitude, point.longitude)
        : Infinity;
      const tags = group.park.tags ?? {};
      const names = [tags.name, tags["name:en"], tags.alt_name, tags.official_name].filter(
        (n): n is string => Boolean(n),
      );
      const nameScore = Math.max(0, ...names.map((n) => parkNameScore(n, park.name)));
      return { group, nameScore, distanceKm };
    })
    .filter((c) => c.distanceKm <= OSM_PARK_MAX_KM);
  if (!candidates.length) return null;

  const named = candidates
    .filter((c) => c.nameScore >= 0.6)
    .sort((a, b) => b.nameScore - a.nameScore || a.distanceKm - b.distanceKm);
  if (named.length) return { ...named[0], confident: true };
  const nearest = [...candidates].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  return { ...nearest, confident: false };
}

export type OsmFeature = {
  id: string;
  name: string;
  names: string[];
  osmIds: string[];
  point: LatLon | null;
};

function osmNames(tags: Record<string, string>, lifecycle: boolean): string[] {
  const keys = ["name", "name:en", "alt_name", "old_name", "official_name"];
  const prefixed = lifecycle ? OSM_LIFECYCLE_PREFIXES.flatMap((p) => keys.map((k) => `${p}:${k}`)) : [];
  const out = new Set<string>();
  for (const key of [...keys, ...prefixed]) {
    for (const part of (tags[key] ?? "").split(";")) if (part.trim()) out.add(part.trim());
  }
  return [...out];
}

/** Track pieces of one coaster are usually separate ways sharing a name — fold them together. */
export function groupOsmFeatures(elements: OsmElement[], lifecycle: boolean): OsmFeature[] {
  const byName = new Map<string, OsmFeature>();
  for (const el of elements) {
    const names = osmNames(el.tags ?? {}, lifecycle);
    if (!names.length) continue;
    const key = names[0].toLowerCase();
    const osmId = `${el.type}/${el.id}`;
    const existing = byName.get(key);
    if (existing) {
      existing.osmIds.push(osmId);
      for (const n of names) if (!existing.names.includes(n)) existing.names.push(n);
      continue;
    }
    byName.set(key, { id: osmId, name: names[0], names, osmIds: [osmId], point: osmElementPoint(el) });
  }
  return [...byName.values()];
}

export type OsmRowEvidence =
  | { kind: "present"; coasterId: number; feature: OsmFeature; matchMethod: string }
  | { kind: "lifecycle_removed"; coasterId: number; feature: OsmFeature; matchMethod: string }
  | { kind: "not_mapped"; coasterId: number };

export type OsmParkAssessment = {
  parkId: number;
  parkName: string;
  polygon: { osmId: string; name: string | null; nameScore: number; distanceKm: number; confident: boolean };
  rows: OsmRowEvidence[];
  /** Named OSM roller coasters inside the polygon with no catalog row at all (review only). */
  possibleMissing: OsmFeature[];
};

function featureEntities(features: OsmFeature[]): ThemeParksChildEntity[] {
  // Each alternative name becomes a candidate with the same id; the matcher consumes ids once.
  return features.flatMap((f) => f.names.map((name) => ({ id: f.id, name, entityType: "ATTRACTION" })));
}

export function assessOsmPark(opts: {
  park: EvidencePark;
  coasters: EvidenceCoaster[];
  choice: OsmParkChoice;
  aliasLookup: AliasLookup;
}): OsmParkAssessment {
  const { park, coasters, choice, aliasLookup } = opts;
  const active = groupOsmFeatures(choice.group.active, false);
  const removed = groupOsmFeatures(choice.group.lifecycle, true);

  const match = (rows: EvidenceCoaster[], features: OsmFeature[]) =>
    matchParkCoastersToThemeParks({
      park: matcherPark(park),
      coasters: toMatcherRows(rows),
      themeParksParkId: "osm",
      themeParksParkName: "osm",
      parkMatchMethod: "auto",
      attractions: featureEntities(features),
      aliasLookup,
    });

  // Match every catalog row (defunct included) so old track still mapped in OSM is not
  // mistaken for a coaster missing from the catalog.
  const activeResult = match(coasters, active);
  const activeById = new Map(active.map((f) => [f.id, f]));
  const activeByCoaster = new Map(activeResult.matched.map((m) => [m.coasterId, m]));
  const unmatched = coasters.filter((c) => !activeByCoaster.has(c.id));
  const removedResult = match(unmatched, removed);
  const removedById = new Map(removed.map((f) => [f.id, f]));
  const removedByCoaster = new Map(removedResult.matched.map((m) => [m.coasterId, m]));

  const rows: OsmRowEvidence[] = coasters
    .filter((c) => c.lifecycle === "Unknown")
    .map((c) => {
      const a = activeByCoaster.get(c.id);
      if (a) return { kind: "present", coasterId: c.id, feature: activeById.get(a.themeParksId)!, matchMethod: a.matchMethod };
      const r = removedByCoaster.get(c.id);
      if (r) {
        return {
          kind: "lifecycle_removed",
          coasterId: c.id,
          feature: removedById.get(r.themeParksId)!,
          matchMethod: r.matchMethod,
        };
      }
      return { kind: "not_mapped", coasterId: c.id };
    });

  const matchedFeatureIds = new Set(activeResult.matched.map((m) => m.themeParksId));
  const tags = choice.group.park.tags ?? {};
  return {
    parkId: park.id,
    parkName: park.name,
    polygon: {
      osmId: `${choice.group.park.type}/${choice.group.park.id}`,
      name: tags.name ?? null,
      nameScore: Number(choice.nameScore.toFixed(3)),
      distanceKm: Number(choice.distanceKm.toFixed(2)),
      confident: choice.confident,
    },
    rows,
    possibleMissing: active.filter((f) => !matchedFeatureIds.has(f.id)),
  };
}

// ---------------------------------------------------------------------------
// Combined verdict per unconfirmed row
// ---------------------------------------------------------------------------

export type StatusVerdict =
  | "propose_operating"
  | "review_operating"
  | "review_defunct"
  | "conflict"
  | "no_evidence";

export type VerdictDecision = {
  verdict: StatusVerdict;
  /** Only true for a strong ThemeParks.wiki match — the one thing `--apply` may write. */
  appliable: boolean;
  reasons: string[];
};

/** OSM centre further than this from the ThemeParks.wiki pin suggests a different ride. */
export const LOCATION_MISMATCH_KM = 1;

export function decideStatusVerdict(opts: {
  coaster: EvidenceCoaster;
  themeParks?: ThemeParksRowEvidence | null;
  osm?: OsmRowEvidence | null;
  currentYear: number;
}): VerdictDecision {
  const { coaster, currentYear } = opts;
  const tp = opts.themeParks ?? null;
  const osm = opts.osm ?? null;
  const reasons: string[] = [];
  const osmPresent = osm?.kind === "present";
  const osmRemoved = osm?.kind === "lifecycle_removed";

  if (osmPresent) reasons.push(`OSM maps it as a current roller coaster (${osm.feature.osmIds[0]})`);
  if (osmRemoved) reasons.push(`OSM tags it as removed/disused (${osm.feature.osmIds[0]})`);

  if (tp?.kind === "present") {
    reasons.push(`in ThemeParks.wiki current lineup as "${tp.entityName}" (${tp.matchMethod})`);
    for (const r of tp.weakReasons) reasons.push(`weak: ${r}`);
    if (osmRemoved) return { verdict: "conflict", appliable: false, reasons };

    let distanceProblem = false;
    if (osmPresent && tp.location && osm.feature.point) {
      const km = haversineKm(
        tp.location.latitude,
        tp.location.longitude,
        osm.feature.point.latitude,
        osm.feature.point.longitude,
      );
      if (km > LOCATION_MISMATCH_KM) {
        distanceProblem = true;
        reasons.push(`ThemeParks.wiki pin is ${km.toFixed(1)} km from the OSM track`);
      }
    }
    const upcoming = coaster.opening_year != null && coaster.opening_year > currentYear;
    if (upcoming) reasons.push(`catalog opening year ${coaster.opening_year} is in the future`);

    if (tp.strength === "strong" && !upcoming && !distanceProblem) {
      return { verdict: "propose_operating", appliable: true, reasons };
    }
    return { verdict: "review_operating", appliable: false, reasons };
  }

  if (tp?.kind === "absent" && tp.parkCovered) {
    reasons.push("missing from ThemeParks.wiki feed for a park the feed otherwise covers");
    if (osmPresent) return { verdict: "conflict", appliable: false, reasons };
    return { verdict: "review_defunct", appliable: false, reasons };
  }
  if (tp?.kind === "absent") reasons.push(`not in ThemeParks.wiki feed, but ${tp.coverageReason}`);

  if (osmPresent) return { verdict: "review_operating", appliable: false, reasons };
  if (osmRemoved) return { verdict: "review_defunct", appliable: false, reasons };
  return { verdict: "no_evidence", appliable: false, reasons };
}

export function hasEvidence(verdict: StatusVerdict): boolean {
  return verdict !== "no_evidence";
}

// ---------------------------------------------------------------------------
// Applying approved proposals
// ---------------------------------------------------------------------------

export type StatusProposal = {
  coasterId: number;
  coasterName: string;
  parkName: string;
  verdict: StatusVerdict;
  appliable: boolean;
  themeParks: ThemeParksRowEvidence | null;
};

export type ExistingStatusOverride = { coaster_id: number; value_text: string | null; source: string };

export type StatusOverrideWrite = {
  coaster_id: number;
  field_name: "status";
  value_text: "Operating";
  source: "themeparks_wiki";
  source_url: string;
  approved: true;
};

export function selectOverrideWrites(opts: {
  proposals: StatusProposal[];
  approvedIds: Set<number>;
  existingOverrides: ExistingStatusOverride[];
  /** Live lifecycle at apply time; rows confirmed since the report are skipped. */
  currentLifecycle: Map<number, Lifecycle>;
}): { writes: StatusOverrideWrite[]; skipped: Array<{ coasterId: number; reason: string }> } {
  const byId = new Map(opts.proposals.map((p) => [p.coasterId, p]));
  const existing = new Map(opts.existingOverrides.map((o) => [o.coaster_id, o]));
  const writes: StatusOverrideWrite[] = [];
  const skipped: Array<{ coasterId: number; reason: string }> = [];

  for (const coasterId of [...opts.approvedIds].sort((a, b) => a - b)) {
    const p = byId.get(coasterId);
    if (!p) {
      skipped.push({ coasterId, reason: "not in this report" });
      continue;
    }
    if (!p.appliable || p.verdict !== "propose_operating" || p.themeParks?.kind !== "present") {
      skipped.push({ coasterId, reason: `verdict ${p.verdict} is review-only; fix by hand with a cited source` });
      continue;
    }
    const prior = existing.get(coasterId);
    if (prior) {
      skipped.push({
        coasterId,
        reason: `already has a status override (${prior.value_text ?? "?"} from ${prior.source})`,
      });
      continue;
    }
    const now = opts.currentLifecycle.get(coasterId);
    if (now !== "Unknown") {
      skipped.push({ coasterId, reason: now ? `status is now ${now}` : "coaster no longer in catalog" });
      continue;
    }
    writes.push({
      coaster_id: coasterId,
      field_name: "status",
      value_text: "Operating",
      source: "themeparks_wiki",
      source_url: p.themeParks.entityUrl,
      approved: true,
    });
  }
  return { writes, skipped };
}

/** Approval list: coaster ids, one per line or comma-separated; `#` starts a comment. */
export function parseApprovalList(text: string): Set<number> {
  const ids = new Set<number>();
  for (const line of text.split(/\r?\n/)) {
    for (const token of line.replace(/#.*/, "").split(/[,\s]+/)) {
      if (!token) continue;
      const n = Number(token);
      if (!Number.isInteger(n) || n <= 0) throw new Error(`Bad coaster id in approval list: "${token}"`);
      ids.add(n);
    }
  }
  return ids;
}
