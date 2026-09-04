import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Coaster, Park } from "@/types/domain";
import { normalizeCatalog, serializeNormalizedCatalog, deserializeNormalizedCatalog } from "@/lib/catalog-normalize";
import { parkBrandPriorityBonus, selectSitemapCoasters, selectSitemapParks } from "@/lib/catalog-sitemap";
import { dedupeCoastersForCatalog } from "@/lib/coaster-dedup";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { compareCoastersOperatingFirst } from "@/lib/catalog-coaster-sort";
import { canonicalCountryLabel, reconcileCountryWithCoords } from "@/lib/geo-country";
import { matchesSearchQuery } from "@/lib/display";
import { isCatalogHiddenParkName } from "@/lib/park-match";

const PARK_COLUMNS = "id,name,country,latitude,longitude";
const COASTER_COLUMNS_CORE =
  "id,park_id,name,coaster_type,manufacturer,status,wikidata_id,image_url,length_ft,speed_mph,height_ft,inversions,duration_s,opening_year,closing_year";
const COASTER_COLUMNS = `${COASTER_COLUMNS_CORE},enwiki_title,summary_text,rcdb_id`;

let anonClient: SupabaseClient | null = null;
/** When true, new summary/rcdb columns are missing — use core select only. */
let coasterSelectFallback = false;

/** Public anon client for server components / sitemap (parks & coasters are publicly readable). */
export function getSupabaseAnonServerClient(): SupabaseClient | null {
  if (anonClient) return anonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anonClient;
}

export type ParkDetail = Park;

export type CoasterDetail = Coaster & {
  parks: Pick<Park, "id" | "name" | "country" | "latitude" | "longitude"> | null;
};

export async function getParkById(id: number): Promise<ParkDetail | null> {
  const canonicalId = await resolveCatalogParkId(id);
  const normalized = await getNormalizedCatalog();
  const park = normalized.parks.find((row) => row.id === canonicalId);
  if (!park || isCatalogHiddenParkName(park.name)) return null;
  return {
    id: park.id,
    name: park.name,
    country: displayCountryForPark(park),
    latitude: park.latitude,
    longitude: park.longitude,
  };
}

async function fetchAllParksRaw(): Promise<Park[]> {
  return fetchAllIds<Park>("parks", PARK_COLUMNS);
}

function activeCoasterColumns(): string {
  return coasterSelectFallback ? COASTER_COLUMNS_CORE : COASTER_COLUMNS;
}

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false;
  return /enwiki_title|summary_text|rcdb_id|column .* does not exist|Could not find/i.test(error.message);
}

async function fetchAllCoastersRaw(): Promise<Coaster[]> {
  const columns = activeCoasterColumns();
  const rows = await fetchAllIds<Coaster>("coasters", columns);
  if (rows.length > 0 || coasterSelectFallback) return rows;

  // Empty could mean no data OR a failed select on missing columns — probe once.
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return [];
  const { error } = await supabase.from("coasters").select(COASTER_COLUMNS).limit(1);
  if (isMissingColumnError(error)) {
    coasterSelectFallback = true;
    return fetchAllIds<Coaster>("coasters", COASTER_COLUMNS_CORE);
  }
  return rows;
}

const getNormalizedCatalogCached = unstable_cache(
  async () => {
    const [parks, coasters] = await Promise.all([fetchAllParksRaw(), fetchAllCoastersRaw()]);
    return serializeNormalizedCatalog(normalizeCatalog(parks, coasters));
  },
  ["catalog-normalized-v4"],
  { revalidate: 3600 },
);

async function getNormalizedCatalog() {
  const cached = await getNormalizedCatalogCached();
  return deserializeNormalizedCatalog(cached);
}

/** Canonical park id after merge/absorb (matches map display). */
export async function resolveCatalogParkId(parkId: number): Promise<number> {
  const { idRemap } = await getNormalizedCatalog();
  let id = parkId;
  const seen = new Set<number>();
  while (idRemap.has(id) && !seen.has(id)) {
    seen.add(id);
    id = idRemap.get(id)!;
  }
  return id;
}

export async function getCoastersForPark(parkId: number): Promise<Coaster[]> {
  const normalized = await getNormalizedCatalog();
  const canonicalId = await resolveCatalogParkId(parkId);
  const forPark = normalized.coasters.filter((c) => c.park_id === canonicalId);
  return dedupeCoastersForCatalog(forPark).sort(compareCoastersOperatingFirst);
}

export async function getCoasterById(id: number): Promise<CoasterDetail | null> {
  const normalized = await getNormalizedCatalog();
  const coaster = normalized.coasters.find((row) => row.id === id);
  if (!coaster) return null;

  const park = normalized.parks.find((row) => row.id === coaster.park_id) ?? null;
  if (!park || isCatalogHiddenParkName(park.name)) return null;

  const fixed = applyCoasterKnownFixes(coaster);
  return {
    ...fixed,
    parks: {
      id: park.id,
      name: park.name,
      country: displayCountryForPark(park),
      latitude: park.latitude,
      longitude: park.longitude,
    },
  };
}

export async function listParksForSitemap(): Promise<Pick<Park, "id" | "name">[]> {
  const normalized = await getNormalizedCatalog();
  return selectSitemapParks(normalized.parks, normalized.coasters);
}

export async function listCoastersForSitemap(): Promise<Pick<Coaster, "id" | "name">[]> {
  const normalized = await getNormalizedCatalog();
  const parks = selectSitemapParks(normalized.parks, normalized.coasters);
  return selectSitemapCoasters(normalized.coasters, {
    parkIds: new Set(parks.map((row) => row.id)),
  });
}

function isExcludedFeaturedParkName(name: string): boolean {
  if (isCatalogHiddenParkName(name)) return true;
  // Legacy jammed CSV location blobs (also caught by isCatalogHidden when camelCase-jammed).
  return /[a-z][A-Z]/.test(name) && /\b(florida|california|georgia|united states)\b/i.test(name);
}

function displayCountryForPark(park: Park): string {
  return (
    reconcileCountryWithCoords(park.country, park.latitude ?? null, park.longitude ?? null) ||
    canonicalCountryLabel(park.country) ||
    park.country ||
    "Unknown"
  );
}

function buildPublicCoasterIndexRows(
  normalized: Awaited<ReturnType<typeof getNormalizedCatalog>>,
): CoasterIndexRow[] {
  const parkById = new Map(normalized.parks.map((park) => [park.id, park]));

  return dedupeCoastersForCatalog(normalized.coasters)
    .filter((coaster) => {
      const park = parkById.get(coaster.park_id);
      return park && !isCatalogHiddenParkName(park.name);
    })
    .map((coaster) => {
      const park = parkById.get(coaster.park_id)!;
      return {
        id: coaster.id,
        name: coaster.name,
        coaster_type: coaster.coaster_type,
        manufacturer: coaster.manufacturer,
        park_id: coaster.park_id,
        status: coaster.status,
        closing_year: coaster.closing_year,
        parks: {
          id: park.id,
          name: park.name,
          country: displayCountryForPark(park),
        },
      };
    });
}

function buildPublicCatalogParks(
  normalized: Awaited<ReturnType<typeof getNormalizedCatalog>>,
): Park[] {
  const parkById = new Map(normalized.parks.map((park) => [park.id, park]));
  const parkIdsWithCoasters = new Set<number>();
  for (const coaster of normalized.coasters) {
    const park = parkById.get(coaster.park_id);
    if (park && !isCatalogHiddenParkName(park.name)) {
      parkIdsWithCoasters.add(coaster.park_id);
    }
  }

  return normalized.parks
    .filter((park) => !isCatalogHiddenParkName(park.name) && parkIdsWithCoasters.has(park.id))
    .map((park) => ({
      id: park.id,
      name: park.name,
      country: displayCountryForPark(park),
      latitude: park.latitude,
      longitude: park.longitude,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Lightweight coaster rows for the public /coasters index (name + park). */
export type CoasterIndexRow = Pick<
  Coaster,
  "id" | "name" | "coaster_type" | "manufacturer" | "park_id" | "status" | "closing_year"
> & {
  parks: Pick<Park, "id" | "name" | "country"> | null;
};

/** Lightweight coaster rows for the public /coasters index (name + park). Full catalog, no hard cap. */
export async function listCoastersForIndex(search?: string): Promise<CoasterIndexRow[]> {
  const normalized = await getNormalizedCatalog();
  let rows = buildPublicCoasterIndexRows(normalized);

  const q = search?.trim() ?? "";
  if (q) {
    rows = rows.filter((row) => {
      const haystack = `${row.name} ${row.parks?.name ?? ""} ${row.parks?.country ?? ""}`;
      return matchesSearchQuery(haystack, q);
    });
  }

  return rows.sort(compareCoastersOperatingFirst);
}

/**
 * Parks for the public /parks index. Optional `search` filters by park name or country.
 * Uses the same normalized catalog as the map so list/map stay aligned.
 */
export async function listCatalogParks(search?: string): Promise<Park[]> {
  const normalized = await getNormalizedCatalog();
  const parks = buildPublicCatalogParks(normalized);

  const q = search?.trim() ?? "";
  if (!q) return parks;

  return parks.filter((park) => {
    const haystack = `${park.name} ${park.country ?? ""}`;
    return matchesSearchQuery(haystack, q);
  });
}

type ParkWithRideCount = ParkDetail & { rideCount: number };

export async function listFeaturedParks(limit = 12): Promise<ParkDetail[]> {
  const normalized = await getNormalizedCatalog();
  const parkById = new Map(normalized.parks.map((park) => [park.id, park]));
  const rideCounts = new Map<number, number>();

  for (const coaster of normalized.coasters) {
    const park = parkById.get(coaster.park_id);
    if (!park || isCatalogHiddenParkName(park.name)) continue;
    rideCounts.set(coaster.park_id, (rideCounts.get(coaster.park_id) ?? 0) + 1);
  }

  const scored: ParkWithRideCount[] = [];
  for (const park of buildPublicCatalogParks(normalized)) {
    if (isExcludedFeaturedParkName(park.name)) continue;
    if (park.latitude == null || park.longitude == null) continue;
    const rideCount = rideCounts.get(park.id) ?? 0;
    if (rideCount < 3) continue;
    scored.push({
      id: park.id,
      name: park.name,
      country: park.country,
      latitude: park.latitude,
      longitude: park.longitude,
      rideCount,
    });
  }

  scored.sort((a, b) => {
    const scoreA = a.rideCount + parkBrandPriorityBonus(a.name);
    const scoreB = b.rideCount + parkBrandPriorityBonus(b.name);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.name.localeCompare(b.name);
  });

  // Soft country diversity so the hub isn't only US megaparks.
  const featured: ParkDetail[] = [];
  const usedIds = new Set<number>();
  const countryCounts = new Map<string, number>();
  const maxPerCountry = Math.max(3, Math.ceil(limit / 3));

  for (const park of scored) {
    if (featured.length >= limit) break;
    const country = (park.country || "Unknown").trim() || "Unknown";
    const used = countryCounts.get(country) ?? 0;
    if (used >= maxPerCountry) continue;
    featured.push({
      id: park.id,
      name: park.name,
      country: park.country,
      latitude: park.latitude,
      longitude: park.longitude,
    });
    usedIds.add(park.id);
    countryCounts.set(country, used + 1);
  }

  // Fill remaining slots by score if diversity caps left gaps.
  if (featured.length < limit) {
    for (const park of scored) {
      if (featured.length >= limit) break;
      if (usedIds.has(park.id)) continue;
      featured.push({
        id: park.id,
        name: park.name,
        country: park.country,
        latitude: park.latitude,
        longitude: park.longitude,
      });
      usedIds.add(park.id);
    }
  }

  return featured;
}

async function fetchAllIds<T>(table: "parks" | "coasters", columns: string): Promise<T[]> {
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return [];

  const pageSize = 1000;
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data?.length) break;
    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export type CatalogIndexCounts = {
  parks: number;
  coasters: number;
  countries: number;
};

/** Totals for catalog index pages (after park/coaster normalization, matching public lists). */
export async function getCatalogIndexCounts(): Promise<CatalogIndexCounts> {
  const normalized = await getNormalizedCatalog();
  const parks = buildPublicCatalogParks(normalized);
  const coasters = buildPublicCoasterIndexRows(normalized);
  const countries = new Set(
    parks.map((park) => (park.country || "Unknown").trim() || "Unknown"),
  ).size;

  return {
    parks: parks.length,
    coasters: coasters.length,
    countries,
  };
}
