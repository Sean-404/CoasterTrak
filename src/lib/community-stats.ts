/**
 * Anonymous community stats for public catalog pages.
 * SQL (`community_coaster_stats`) already nulls any metric with fewer than
 * COMMUNITY_MIN_CONTRIBUTORS users; we re-check here so a bad row can never
 * surface a small, identifying number.
 */
export const COMMUNITY_MIN_CONTRIBUTORS = 5;

export type CommunityCoasterStats = {
  coasterId: number;
  riderCount: number | null;
  ratingCount: number | null;
  /** Mean of 1–5 star ratings, one decimal. Null whenever ratingCount is null. */
  averageRating: number | null;
  wishlistCount: number | null;
};

/** Row shape returned by the `community_coaster_stats` RPC. */
export type CommunityCoasterStatsRow = {
  coaster_id: number | string | null;
  rider_count: number | string | null;
  rating_count: number | string | null;
  average_rating: number | string | null;
  wishlist_count: number | string | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A contributor count, or null when below the anonymity threshold. */
export function thresholdCount(value: unknown, min = COMMUNITY_MIN_CONTRIBUTORS): number | null {
  const n = toFiniteNumber(value);
  if (n == null || !Number.isInteger(n) || n < min) return null;
  return n;
}

/** Normalise one RPC row; returns null when nothing in it clears the threshold. */
export function parseCommunityStatsRow(row: CommunityCoasterStatsRow): CommunityCoasterStats | null {
  const coasterId = toFiniteNumber(row.coaster_id);
  if (coasterId == null || !Number.isInteger(coasterId) || coasterId <= 0) return null;

  const riderCount = thresholdCount(row.rider_count);
  let ratingCount = thresholdCount(row.rating_count);
  let averageRating = toFiniteNumber(row.average_rating);
  if (ratingCount == null || averageRating == null || averageRating < 1 || averageRating > 5) {
    ratingCount = null;
    averageRating = null;
  } else {
    averageRating = Math.round(averageRating * 10) / 10;
  }
  const wishlistCount = thresholdCount(row.wishlist_count);

  if (riderCount == null && ratingCount == null && wishlistCount == null) return null;
  return { coasterId, riderCount, ratingCount, averageRating, wishlistCount };
}

export function hasCommunityStats(stats: CommunityCoasterStats | null | undefined): stats is CommunityCoasterStats {
  return Boolean(stats && (stats.riderCount != null || stats.ratingCount != null || stats.wishlistCount != null));
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** "4.3" — always one decimal so 4 and 4.0 read the same across pages. */
export function formatAverageRating(average: number): string {
  return average.toFixed(1);
}

function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

export function formatRiderCount(n: number): string {
  return plural(n, "rider", "riders");
}

export function formatRatingCount(n: number): string {
  return plural(n, "rating", "ratings");
}

export type ParkCommunityEntry<C> = {
  coaster: C;
  stats: CommunityCoasterStats;
};

export type ParkCommunityHighlights<C> = {
  mostLogged: ParkCommunityEntry<C>[];
  highestRated: ParkCommunityEntry<C>[];
};

/**
 * Rank a park's coasters by community data. Only coasters whose own metric
 * cleared the threshold appear in each list.
 */
export function rankParkCommunityCoasters<C extends { id: number; name: string }>(
  coasters: C[],
  statsById: ReadonlyMap<number, CommunityCoasterStats>,
  limit = 5,
): ParkCommunityHighlights<C> {
  const entries: ParkCommunityEntry<C>[] = [];
  for (const coaster of coasters) {
    const stats = statsById.get(coaster.id);
    if (hasCommunityStats(stats)) entries.push({ coaster, stats });
  }

  const byName = (a: ParkCommunityEntry<C>, b: ParkCommunityEntry<C>) =>
    a.coaster.name.localeCompare(b.coaster.name);

  const mostLogged = entries
    .filter((entry) => entry.stats.riderCount != null)
    .sort((a, b) => b.stats.riderCount! - a.stats.riderCount! || byName(a, b))
    .slice(0, limit);

  const highestRated = entries
    .filter((entry) => entry.stats.averageRating != null && entry.stats.ratingCount != null)
    .sort(
      (a, b) =>
        b.stats.averageRating! - a.stats.averageRating! ||
        b.stats.ratingCount! - a.stats.ratingCount! ||
        byName(a, b),
    )
    .slice(0, limit);

  return { mostLogged, highestRated };
}
