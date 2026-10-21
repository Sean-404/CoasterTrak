import { unstable_cache } from "next/cache";
import { getSupabaseAnonServerClient } from "@/lib/catalog-server";
import {
  parseCommunityStatsRow,
  type CommunityCoasterStats,
  type CommunityCoasterStatsRow,
} from "@/lib/community-stats";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";

/** Bust with `revalidateTag(COMMUNITY_STATS_CACHE_TAG, "max")` to refresh before the weekly fallback. */
export const COMMUNITY_STATS_CACHE_TAG = "community-stats";

/**
 * One cached read of every coaster that clears the anonymity threshold, shared by
 * all park/coaster pages (one RPC per cache period instead of one per page).
 * Throws on RPC errors so a missing migration is not cached as "no riders".
 */
const getCommunityStatsRowsCached = unstable_cache(
  async (): Promise<CommunityCoasterStats[]> => {
    const supabase = getSupabaseAnonServerClient();
    if (!supabase) return [];
    const { data, error } = await fetchAllPages<CommunityCoasterStatsRow>(SUPABASE_PAGE_SIZE, (from, to) =>
      supabase.rpc("community_coaster_stats").order("coaster_id", { ascending: true }).range(from, to),
    );
    if (error) throw new Error(`community_coaster_stats failed: ${error.message}`);
    return data.map(parseCommunityStatsRow).filter((row): row is CommunityCoasterStats => row != null);
  },
  ["community-coaster-stats-v1"],
  // Same fallback as the catalog cache, so detail pages keep their on-demand ISR cadence.
  { revalidate: 604800, tags: [COMMUNITY_STATS_CACHE_TAG] },
);

/** Stats keyed by coaster id, or null when they could not be loaded (block is hidden). */
export async function getCommunityStatsById(): Promise<Map<number, CommunityCoasterStats> | null> {
  try {
    const rows = await getCommunityStatsRowsCached();
    return new Map(rows.map((row) => [row.coasterId, row]));
  } catch (error) {
    console.warn("[community-stats]", error instanceof Error ? error.message : error);
    return null;
  }
}
