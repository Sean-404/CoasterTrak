"use client";

import {
  parseCommunityStatsRow,
  type CommunityCoasterStats,
  type CommunityCoasterStatsRow,
} from "@/lib/community-stats";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";

/** Stats keyed by coaster id; null when they could not be loaded (the line is hidden). */
export type CommunityStatsMap = Map<number, CommunityCoasterStats> | null;

let pending: Promise<CommunityStatsMap> | null = null;

/**
 * One read of the anonymous `community_coaster_stats` totals per page load, shared by
 * every ride sheet. The RPC already applies the 5-contributor threshold server-side.
 */
export function loadCommunityStats(): Promise<CommunityStatsMap> {
  if (pending) return pending;
  pending = (async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const { data, error } = await fetchAllPages<CommunityCoasterStatsRow>(SUPABASE_PAGE_SIZE, (from, to) =>
      supabase.rpc("community_coaster_stats").order("coaster_id", { ascending: true }).range(from, to),
    );
    if (error) {
      pending = null; // let a later sheet retry
      return null;
    }
    const map = new Map<number, CommunityCoasterStats>();
    for (const row of data) {
      const parsed = parseCommunityStatsRow(row);
      if (parsed) map.set(parsed.coasterId, parsed);
    }
    return map;
  })();
  return pending;
}
