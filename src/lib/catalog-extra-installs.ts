/**
 * Ensure Wikipedia mirror-copy / extra-location rides exist as their own
 * catalog rows. Wikidata unique-binds one Q-id to one park, so clones that
 * share an article (Ride of Steel, Superman: Ultimate Flight, etc.) would
 * otherwise only appear at whichever park the coordinates landed on.
 */

import { normalizeCoasterDedupKey } from "@/lib/coaster-dedup";
import {
  ENSURE_COASTER_INSTALLS,
  PARK_NAME_ALIASES,
  type EnsureCoasterInstallSpec,
} from "@/lib/catalog-overrides";
import { isCatalogHiddenParkName, parkNamesMatch } from "@/lib/park-match";
import {
  isCountryOnlyInfoboxLocation,
  type InfoboxCoasterLocation,
  type InfoboxCoasterStats,
} from "@/lib/wikipedia-infobox-coaster";
import type { Coaster, Park } from "@/types/domain";

export type ExtraInstallInsert = {
  action: "insert";
  parkId: number;
  spec: EnsureCoasterInstallSpec;
};

export type ExtraInstallPatch = {
  action: "patch";
  coasterId: number;
  parkId: number;
  spec: EnsureCoasterInstallSpec;
  patch: Partial<Coaster>;
};

export type ExtraInstallPlan = ExtraInstallInsert | ExtraInstallPatch;

type ParkRef = Pick<Park, "id" | "name">;
type CoasterRef = Pick<
  Coaster,
  | "id"
  | "park_id"
  | "name"
  | "status"
  | "coaster_type"
  | "manufacturer"
  | "opening_year"
  | "closing_year"
  | "height_ft"
  | "speed_mph"
  | "length_ft"
  | "inversions"
  | "duration_s"
  | "rcdb_id"
  | "enwiki_title"
>;

export function catalogParkNamesForAlias(name: string): string[] {
  const canonical = PARK_NAME_ALIASES[name.trim()] ?? name.trim();
  return canonical === name.trim() ? [canonical] : [canonical, name.trim()];
}

export function findParkIdForInstall(parks: ParkRef[], spec: EnsureCoasterInstallSpec): number | null {
  const names = [spec.parkName, ...(spec.parkNameAliases ?? [])].flatMap(catalogParkNamesForAlias);
  for (const want of names) {
    const exact = parks.find((p) => p.name.trim().toLowerCase() === want.trim().toLowerCase());
    if (exact) return exact.id;
  }
  for (const want of names) {
    const fuzzy = parks.find((p) => parkNamesMatch(p.name, want));
    if (fuzzy) return fuzzy.id;
  }
  return null;
}

function installNameKeys(spec: EnsureCoasterInstallSpec): Set<string> {
  return new Set(
    [spec.name, ...(spec.nameAliases ?? [])]
      .map((n) => normalizeCoasterDedupKey(n))
      .filter(Boolean),
  );
}

export function coasterMatchesInstallName(coasterName: string, spec: EnsureCoasterInstallSpec): boolean {
  const keys = installNameKeys(spec);
  return keys.has(normalizeCoasterDedupKey(coasterName));
}

function fillIfBlank<T>(current: T | null | undefined, next: T | undefined): T | undefined {
  if (next == null) return undefined;
  if (current == null) return next;
  return undefined;
}

export function buildExtraInstallPatch(
  existing: CoasterRef,
  spec: EnsureCoasterInstallSpec,
): Partial<Coaster> | null {
  const patch: Partial<Coaster> = {};

  if (existing.name !== spec.name) patch.name = spec.name;
  if (existing.status !== spec.status) patch.status = spec.status;
  if (spec.status === "Operating" && existing.closing_year != null && spec.closing_year == null) {
    patch.closing_year = null;
  }
  if (spec.closing_year !== undefined && existing.closing_year !== spec.closing_year) {
    patch.closing_year = spec.closing_year;
  }

  const type = fillIfBlank(existing.coaster_type, spec.coaster_type);
  if (type) patch.coaster_type = type;
  const mfr = fillIfBlank(existing.manufacturer, spec.manufacturer);
  if (mfr) patch.manufacturer = mfr;
  const opened = fillIfBlank(existing.opening_year, spec.opening_year);
  if (opened != null) patch.opening_year = opened;
  const height = fillIfBlank(existing.height_ft, spec.height_ft);
  if (height != null) patch.height_ft = height;
  const speed = fillIfBlank(existing.speed_mph, spec.speed_mph);
  if (speed != null) patch.speed_mph = speed;
  const length = fillIfBlank(existing.length_ft, spec.length_ft);
  if (length != null) patch.length_ft = length;
  const inversions = fillIfBlank(existing.inversions, spec.inversions);
  if (inversions != null) patch.inversions = inversions;
  const duration = fillIfBlank(existing.duration_s, spec.duration_s);
  if (duration != null) patch.duration_s = duration;
  const rcdb = fillIfBlank(existing.rcdb_id, spec.rcdb_id);
  if (rcdb) patch.rcdb_id = rcdb;
  const wiki = fillIfBlank(existing.enwiki_title, spec.enwiki_title);
  if (wiki) patch.enwiki_title = wiki;

  return Object.keys(patch).length ? patch : null;
}

export function planEnsureCoasterInstalls(opts: {
  parks: ParkRef[];
  coasters: CoasterRef[];
  specs?: EnsureCoasterInstallSpec[];
}): ExtraInstallPlan[] {
  const specs = opts.specs ?? ENSURE_COASTER_INSTALLS;
  const usedRcdb = new Set(
    opts.coasters.map((c) => c.rcdb_id?.trim()).filter((id): id is string => Boolean(id)),
  );
  const plans: ExtraInstallPlan[] = [];

  for (const spec of specs) {
    const parkId = findParkIdForInstall(opts.parks, spec);
    if (parkId == null) continue;

    const existing = opts.coasters.find(
      (c) => c.park_id === parkId && coasterMatchesInstallName(c.name, spec),
    );
    if (existing) {
      const patch = buildExtraInstallPatch(existing, spec);
      if (patch) {
        plans.push({ action: "patch", coasterId: existing.id, parkId, spec, patch });
      }
      continue;
    }

    const specForInsert =
      spec.rcdb_id && usedRcdb.has(spec.rcdb_id) ? { ...spec, rcdb_id: undefined } : spec;
    if (specForInsert.rcdb_id) usedRcdb.add(specForInsert.rcdb_id);
    plans.push({ action: "insert", parkId, spec: specForInsert });
  }

  return plans;
}

function locationStatusForInstall(
  loc: InfoboxCoasterLocation,
): EnsureCoasterInstallSpec["status"] | null {
  if (loc.status === "Operating" || loc.status === "Defunct") return loc.status;
  if (loc.closing_year != null) return "Defunct";
  return null;
}

/** Turn a multi-park Wikipedia infobox into sibling catalog specs (no Wikidata id). */
export function specsFromInfoboxLocations(opts: {
  articleTitle: string;
  locations: InfoboxCoasterLocation[];
  stats?: InfoboxCoasterStats;
  existing?: CoasterRef | null;
}): EnsureCoasterInstallSpec[] {
  if (opts.locations.length < 2) return [];

  const rideName =
    opts.locations.find((loc) => loc.name?.trim())?.name?.trim() ||
    opts.existing?.name?.trim() ||
    opts.articleTitle.trim();
  if (!rideName) return [];

  const existing = opts.existing;
  const stats = opts.stats;
  const specs: EnsureCoasterInstallSpec[] = [];

  for (const loc of opts.locations) {
    if (isCatalogHiddenParkName(loc.parkName)) continue;
    if (isCountryOnlyInfoboxLocation(loc.parkName)) continue;
    const status = locationStatusForInstall(loc);
    if (!status) continue;

    const aliases = [rideName, loc.name, opts.articleTitle, existing?.name]
      .map((n) => n?.trim())
      .filter((n): n is string => Boolean(n));

    specs.push({
      parkName: loc.parkName,
      // Prefer the Wikipedia article title so park-specific former names
      // (Superman – Ride of Steel) alias-match instead of inserting a twin.
      name: opts.articleTitle.trim() || loc.name?.trim() || rideName,
      nameAliases: [...new Set(aliases)],
      coaster_type: existing?.coaster_type || stats?.coaster_type || "Steel",
      manufacturer: existing?.manufacturer?.trim() || stats?.manufacturer,
      status,
      opening_year: loc.opening_year,
      closing_year: status === "Defunct" ? (loc.closing_year ?? null) : null,
      height_ft: existing?.height_ft ?? stats?.height_ft,
      speed_mph: existing?.speed_mph ?? stats?.speed_mph,
      length_ft: existing?.length_ft ?? stats?.length_ft,
      inversions: existing?.inversions ?? stats?.inversions,
      duration_s: existing?.duration_s ?? stats?.duration_s,
      rcdb_id: loc.rcdb_id,
      enwiki_title: opts.articleTitle,
    });
  }

  return specs;
}

export function planDiscoveredInfoboxInstalls(opts: {
  parks: ParkRef[];
  coasters: CoasterRef[];
  articleTitle: string;
  locations: InfoboxCoasterLocation[];
  stats?: InfoboxCoasterStats;
}): ExtraInstallPlan[] {
  const existing =
    opts.coasters.find(
      (c) => c.enwiki_title?.trim().toLowerCase() === opts.articleTitle.trim().toLowerCase(),
    ) ?? null;
  const specs = specsFromInfoboxLocations({
    articleTitle: opts.articleTitle,
    locations: opts.locations,
    stats: opts.stats,
    existing,
  });
  return planEnsureCoasterInstalls({ parks: opts.parks, coasters: opts.coasters, specs });
}

export function extraInstallInsertRow(
  parkId: number,
  spec: EnsureCoasterInstallSpec,
  syncedAt: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    park_id: parkId,
    name: spec.name,
    coaster_type: spec.coaster_type,
    status: spec.status,
    last_synced_at: syncedAt,
  };
  if (spec.manufacturer) row.manufacturer = spec.manufacturer;
  if (spec.opening_year != null) row.opening_year = spec.opening_year;
  if (spec.closing_year !== undefined) row.closing_year = spec.closing_year;
  if (spec.height_ft != null) row.height_ft = spec.height_ft;
  if (spec.speed_mph != null) row.speed_mph = spec.speed_mph;
  if (spec.length_ft != null) row.length_ft = spec.length_ft;
  if (spec.inversions != null) row.inversions = spec.inversions;
  if (spec.duration_s != null) row.duration_s = spec.duration_s;
  if (spec.rcdb_id) row.rcdb_id = spec.rcdb_id;
  if (spec.enwiki_title) row.enwiki_title = spec.enwiki_title;
  return row;
}
