import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Coaster, Park } from "@/types/domain";

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
  return data as Coaster[];
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
  return { ...row, parks: park };
}

export async function listParksForSitemap(): Promise<Pick<Park, "id" | "name">[]> {
  return fetchAllIds("parks", "id,name");
}

export async function listCoastersForSitemap(): Promise<Pick<Coaster, "id" | "name">[]> {
  return fetchAllIds("coasters", "id,name");
}

export async function listFeaturedParks(limit = 12): Promise<ParkDetail[]> {
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return [];
  // Prefer parks that have coordinates and a real country label.
  const { data, error } = await supabase
    .from("parks")
    .select(PARK_COLUMNS)
    .not("country", "is", null)
    .neq("country", "")
    .order("name", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data as ParkDetail[];
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
