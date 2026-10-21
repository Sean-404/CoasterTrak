import { describe, expect, it } from "vitest";
import {
  COMMUNITY_MIN_CONTRIBUTORS,
  formatAverageRating,
  formatRatingCount,
  formatRiderCount,
  hasCommunityStats,
  parseCommunityStatsRow,
  rankParkCommunityCoasters,
  thresholdCount,
  type CommunityCoasterStats,
} from "./community-stats";

function stats(partial: Partial<CommunityCoasterStats> & { coasterId: number }): CommunityCoasterStats {
  return { riderCount: null, ratingCount: null, averageRating: null, wishlistCount: null, ...partial };
}

describe("thresholdCount", () => {
  it("hides counts below the anonymity threshold", () => {
    expect(COMMUNITY_MIN_CONTRIBUTORS).toBe(5);
    expect(thresholdCount(0)).toBeNull();
    expect(thresholdCount(4)).toBeNull();
    expect(thresholdCount(5)).toBe(5);
    expect(thresholdCount(120)).toBe(120);
  });

  it("accepts numeric strings and rejects junk", () => {
    expect(thresholdCount("7")).toBe(7);
    expect(thresholdCount("4")).toBeNull();
    expect(thresholdCount(null)).toBeNull();
    expect(thresholdCount("")).toBeNull();
    expect(thresholdCount("abc")).toBeNull();
    expect(thresholdCount(5.5)).toBeNull();
    expect(thresholdCount(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("parseCommunityStatsRow", () => {
  it("keeps metrics that clear the threshold and rounds the average", () => {
    expect(
      parseCommunityStatsRow({
        coaster_id: "42",
        rider_count: 12,
        rating_count: "6",
        average_rating: "4.26",
        wishlist_count: 5,
      }),
    ).toEqual({ coasterId: 42, riderCount: 12, ratingCount: 6, averageRating: 4.3, wishlistCount: 5 });
  });

  it("re-applies the threshold even if the database returned small numbers", () => {
    expect(
      parseCommunityStatsRow({
        coaster_id: 1,
        rider_count: 8,
        rating_count: 3,
        average_rating: 5,
        wishlist_count: 2,
      }),
    ).toEqual({ coasterId: 1, riderCount: 8, ratingCount: null, averageRating: null, wishlistCount: null });
  });

  it("drops the rating when the average is missing or out of range", () => {
    expect(
      parseCommunityStatsRow({ coaster_id: 1, rider_count: 9, rating_count: 9, average_rating: null, wishlist_count: null })
        ?.averageRating,
    ).toBeNull();
    const outOfRange = parseCommunityStatsRow({
      coaster_id: 1,
      rider_count: 9,
      rating_count: 9,
      average_rating: 7,
      wishlist_count: null,
    });
    expect(outOfRange?.averageRating).toBeNull();
    expect(outOfRange?.ratingCount).toBeNull();
  });

  it("returns null when nothing clears the threshold or the id is invalid", () => {
    expect(
      parseCommunityStatsRow({ coaster_id: 3, rider_count: 4, rating_count: 4, average_rating: 4, wishlist_count: 4 }),
    ).toBeNull();
    expect(
      parseCommunityStatsRow({ coaster_id: null, rider_count: 50, rating_count: null, average_rating: null, wishlist_count: null }),
    ).toBeNull();
    expect(
      parseCommunityStatsRow({ coaster_id: -1, rider_count: 50, rating_count: null, average_rating: null, wishlist_count: null }),
    ).toBeNull();
  });
});

describe("hasCommunityStats", () => {
  it("is false for missing or empty stats", () => {
    expect(hasCommunityStats(undefined)).toBe(false);
    expect(hasCommunityStats(null)).toBe(false);
    expect(hasCommunityStats(stats({ coasterId: 1 }))).toBe(false);
    expect(hasCommunityStats(stats({ coasterId: 1, wishlistCount: 5 }))).toBe(true);
  });
});

describe("formatting", () => {
  it("formats averages with one decimal", () => {
    expect(formatAverageRating(4)).toBe("4.0");
    expect(formatAverageRating(4.3)).toBe("4.3");
  });

  it("pluralises and groups counts", () => {
    expect(formatRiderCount(1)).toBe("1 rider");
    expect(formatRiderCount(1234)).toBe("1,234 riders");
    expect(formatRatingCount(5)).toBe("5 ratings");
  });
});

describe("rankParkCommunityCoasters", () => {
  const coasters = [
    { id: 1, name: "Alpha" },
    { id: 2, name: "Bravo" },
    { id: 3, name: "Charlie" },
    { id: 4, name: "Delta" },
    { id: 5, name: "Echo" },
  ];

  it("orders most-logged by rider count, then name", () => {
    const byId = new Map([
      [1, stats({ coasterId: 1, riderCount: 10 })],
      [2, stats({ coasterId: 2, riderCount: 30 })],
      [3, stats({ coasterId: 3, riderCount: 10 })],
      [4, stats({ coasterId: 4, wishlistCount: 8 })],
    ]);
    const { mostLogged, highestRated } = rankParkCommunityCoasters(coasters, byId);
    expect(mostLogged.map((entry) => entry.coaster.name)).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(highestRated).toEqual([]);
  });

  it("orders highest-rated by average, then rating count, and skips unrated", () => {
    const byId = new Map([
      [1, stats({ coasterId: 1, riderCount: 20, ratingCount: 6, averageRating: 4.5 })],
      [2, stats({ coasterId: 2, riderCount: 40, ratingCount: 25, averageRating: 4.5 })],
      [3, stats({ coasterId: 3, riderCount: 9, ratingCount: 9, averageRating: 4.9 })],
      [5, stats({ coasterId: 5, riderCount: 12 })],
    ]);
    const { highestRated } = rankParkCommunityCoasters(coasters, byId);
    expect(highestRated.map((entry) => entry.coaster.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("ignores stats for coasters that are not at the park and respects the limit", () => {
    const byId = new Map(
      [1, 2, 3, 4, 5, 99].map((id) => [id, stats({ coasterId: id, riderCount: 100 - id })] as const),
    );
    const { mostLogged } = rankParkCommunityCoasters(coasters, byId, 3);
    expect(mostLogged.map((entry) => entry.coaster.id)).toEqual([1, 2, 3]);
  });
});
