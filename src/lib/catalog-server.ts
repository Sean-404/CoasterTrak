import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Coaster, Park } from "@/types/domain";
import { dedupeCoastersForCatalog } from "@/lib/coaster-dedup";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { canonicalCountryLabel } from "@/lib/geo-country";
import { matchesSearchQuery } from "@/lib/display";
import { dedupeParksForCatalog, isCatalogHiddenParkName } from "@/lib/park-match";

const PARK_COLUMNS = "id,name,country,latitude,longitude";
const COASTER_COLUMNS =
  "id,park_id,name,coaster_type,manufacturer,status,wikidata_id,image_url,length_ft,speed_mph,height_ft,inversions,duration_s,opening_year,closing_year";

let anonClient: SupabaseClient | null = null;

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
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("parks").select(PARK_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as ParkDetail;
}

export async function getCoastersForPark(parkId: number): Promise<Coaster[]> {
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("coasters")
    .select(COASTER_COLUMNS)
    .eq("park_id", parkId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return dedupeCoastersForCatalog((data as Coaster[]).map(applyCoasterKnownFixes));
}

export async function getCoasterById(id: number): Promise<CoasterDetail | null> {
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("coasters")
    .select(`${COASTER_COLUMNS}, parks(${PARK_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as Coaster & {
    parks:
      | Pick<Park, "id" | "name" | "country" | "latitude" | "longitude">
      | Pick<Park, "id" | "name" | "country" | "latitude" | "longitude">[]
      | null;
  };
  const park = Array.isArray(row.parks) ? (row.parks[0] ?? null) : row.parks;
  const fixed = applyCoasterKnownFixes(row);
  return { ...fixed, parks: park };
}

export async function listParksForSitemap(): Promise<Pick<Park, "id" | "name">[]> {
  const rows = await fetchAllIds<Pick<Park, "id" | "name">>("parks", "id,name");
  return rows.filter((p) => !isCatalogHiddenParkName(p.name));
}

export async function listCoastersForSitemap(): Promise<Pick<Coaster, "id" | "name">[]> {
  return fetchAllIds("coasters", "id,name");
}

const FEATURED_PARK_BRAND_BONUSES: Array<{ pattern: RegExp; bonus: number }> = [
  { pattern: /\balton\s*towers\b/i, bonus: 120 },
  { pattern: /\bdisney/i, bonus: 100 },
  { pattern: /\buniversal\b/i, bonus: 100 },
  { pattern: /\bsix\s*flags\b/i, bonus: 90 },
  { pattern: /\beuropa[\s-]?park\b/i, bonus: 90 },
  { pattern: /\bcedar\s*point\b/i, bonus: 85 },
  { pattern: /\bthorpe\s*park\b/i, bonus: 80 },
  { pattern: /\bphantasialand\b/i, bonus: 80 },
  { pattern: /\befteling\b/i, bonus: 75 },
  { pattern: /\benergylandia\b/i, bonus: 75 },
  { pattern: /\bblackpool\b/i, bonus: 70 },
  { pattern: /\bbusch\s*gardens\b/i, bonus: 70 },
  { pattern: /\bseaworld\b/i, bonus: 65 },
  { pattern: /\blegoland\b/i, bonus: 60 },
  { pattern: /\bhershey/i, bonus: 55 },
  { pattern: /\bkings\s*(island|dominion)\b/i, bonus: 55 },
  { pattern: /\bknoebels\b/i, bonus: 50 },
  { pattern: /\bport\s*aventura\b/i, bonus: 50 },
  { pattern: /\btoverland\b/i, bonus: 45 },
  { pattern: /\bheide[\s-]?park\b/i, bonus: 45 },
];

function featuredParkBrandBonus(name: string): number {
  let best = 0;
  for (const entry of FEATURED_PARK_BRAND_BONUSES) {
    if (entry.pattern.test(name)) best = Math.max(best, entry.bonus);
  }
  return best;
}

function isExcludedFeaturedParkName(name: string): boolean {
  if (isCatalogHiddenParkName(name)) return true;
  // Legacy jammed CSV location blobs (also caught by isCatalogHidden when camelCase-jammed).
  return /[a-z][A-Z]/.test(name) && /\b(florida|california|georgia|united states)\b/i.test(name);
}

/** Lightweight coaster rows for the public /coasters index (name + park). */
export type CoasterIndexRow = Pick<
  Coaster,
  "id" | "name" | "coaster_type" | "manufacturer" | "park_id"
> & {
  parks: Pick<Park, "id" | "name" | "country"> | null;
};

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function normalizeCoasterIndexRows(
  data: Array<
    Coaster & {
      parks:
        | Pick<Park, "id" | "name" | "country">
        | Pick<Park, "id" | "name" | "country">[]
        | null;
    }
  >,
): CoasterIndexRow[] {
  const rows = data.map((row) => {
    const fixed = applyCoasterKnownFixes(row);
    return {
      ...fixed,
      parks: Array.isArray(row.parks) ? (row.parks[0] ?? null) : row.parks,
    };
  });

  return dedupeCoastersForCatalog(rows).map(
    ({ id, name, coaster_type, manufacturer, park_id, parks }) => ({
      id,
      name,
      coaster_type,
      manufacturer,
      park_id,
      parks,
    }),
  );
}

/**
 * Parks for the public /parks index. Optional `search` filters by park name or country.
 */
export async function listCatalogParks(search?: string): Promise<Park[]> {
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return [];

  const pageSize = 1000;
  const rows: Array<Park & { rideCount: number }> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("parks")
      .select(`${PARK_COLUMNS}, coasters(count)`)
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data?.length) break;

    for (const row of data as Array<
      Park & { coasters: { count: number }[] | { count: number } | null }
    >) {
      const countRaw = Array.isArray(row.coasters) ? row.coasters[0]?.count : row.coasters?.count;
      rows.push({
        id: row.id,
        name: row.name,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
        rideCount: typeof countRaw === "number" ? countRaw : 0,
      });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const parks = dedupeParksForCatalog(rows).map(({ id, name, country, latitude, longitude }) => ({
    id,
    name,
    country: canonicalCountryLabel(country) || country,
    latitude,
    longitude,
  }));

  const q = search?.trim() ?? "";
  if (!q) return parks;

  return parks.filter((park) => {
    const haystack = `${park.name} ${park.country ?? ""}`;
    return matchesSearchQuery(haystack, q);
  });
}

type ParkWithRideCount = ParkDetail & { rideCount: number };

export async function listFeaturedParks(limit = 12): Promise<ParkDetail[]> {
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return [];

  // Prefer parks with many rides + well-known brands (Disney, Universal, Six Flags, Alton Towers…).
  const { data, error } = await supabase
    .from("parks")
    .select(`${PARK_COLUMNS}, coasters(count)`)
    .not("country", "is", null)
    .neq("country", "")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(500);
  if (error || !data) return [];

  const scored: ParkWithRideCount[] = [];
  for (const row of data as Array<
    ParkDetail & { coasters: { count: number }[] | { count: number } | null }
  >) {
    if (isExcludedFeaturedParkName(row.name)) continue;
    const countRaw = Array.isArray(row.coasters) ? row.coasters[0]?.count : row.coasters?.count;
    const rideCount = typeof countRaw === "number" ? countRaw : 0;
    if (rideCount < 3) continue;
    scored.push({
      id: row.id,
      name: row.name,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      rideCount,
    });
  }

  scored.sort((a, b) => {
    const scoreA = a.rideCount + featuredParkBrandBonus(a.name);
    const scoreB = b.rideCount + featuredParkBrandBonus(b.name);
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

/** Lightweight coaster rows for the public /coasters index (name + park). */
export async function listCoastersForIndex(
  limit = 500,
  search?: string,
): Promise<CoasterIndexRow[]> {
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return [];

  const q = search?.trim() ?? "";
  const selectCols =
    "id,name,coaster_type,manufacturer,park_id,status,wikidata_id,image_url,length_ft,speed_mph,height_ft,inversions,duration_s, parks(id,name,country)";

  if (!q) {
    // Over-fetch so same-park name variants can collapse; trim after dedupe.
    const fetchLimit = Math.min(Math.max(limit * 2, limit + 200), 2000);
    const { data, error } = await supabase
      .from("coasters")
      .select(selectCols)
      .order("name", { ascending: true })
      .limit(fetchLimit);
    if (error || !data) return [];
    return normalizeCoasterIndexRows(
      data as Array<
        Coaster & {
          parks:
            | Pick<Park, "id" | "name" | "country">
            | Pick<Park, "id" | "name" | "country">[]
            | null;
        }
      >,
    ).slice(0, limit);
  }

  // Search: match coaster name and/or park name, then refine with punctuation-insensitive filter.
  const pattern = `%${escapeIlikePattern(q)}%`;
  const fetchLimit = Math.min(Math.max(limit * 3, 400), 1500);

  const [{ data: byName, error: nameErr }, { data: matchingParks, error: parkErr }] =
    await Promise.all([
      supabase
        .from("coasters")
        .select(selectCols)
        .ilike("name", pattern)
        .order("name", { ascending: true })
        .limit(fetchLimit),
      supabase.from("parks").select("id").ilike("name", pattern).limit(200),
    ]);

  if (nameErr && parkErr) return [];

  const byId = new Map<number, CoasterIndexRow>();
  for (const row of normalizeCoasterIndexRows(
    (byName ?? []) as Array<
      Coaster & {
        parks:
          | Pick<Park, "id" | "name" | "country">
          | Pick<Park, "id" | "name" | "country">[]
          | null;
      }
    >,
  )) {
    byId.set(row.id, row);
  }

  const parkIds = (matchingParks ?? [])
    .map((p) => (p as { id: number }).id)
    .filter((id) => Number.isFinite(id));

  if (parkIds.length > 0) {
    const { data: byPark } = await supabase
      .from("coasters")
      .select(selectCols)
      .in("park_id", parkIds.slice(0, 80))
      .order("name", { ascending: true })
      .limit(fetchLimit);
    for (const row of normalizeCoasterIndexRows(
      (byPark ?? []) as Array<
        Coaster & {
          parks:
            | Pick<Park, "id" | "name" | "country">
            | Pick<Park, "id" | "name" | "country">[]
            | null;
        }
      >,
    )) {
      byId.set(row.id, row);
    }
  }

  const filtered = [...byId.values()]
    .filter((row) => {
      const haystack = `${row.name} ${row.parks?.name ?? ""} ${row.parks?.country ?? ""}`;
      return matchesSearchQuery(haystack, q);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return filtered.slice(0, limit);
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
