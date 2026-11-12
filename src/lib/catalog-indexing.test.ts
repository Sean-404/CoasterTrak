import { describe, expect, it, vi } from "vitest";
import type { CommunityCoasterStats } from "@/lib/community-stats";

vi.mock("@/lib/catalog-notes", () => ({
  coasterNote: (id: number) => (id === 10 ? "A hand-written note about coaster 10." : null),
  parkNote: (id: number) => (id === 100 ? "A hand-written note about park 100." : null),
}));

const { CATALOG_THIN_ROBOTS, isCoasterCatalogSubstantial, isParkCatalogSubstantial } = await import(
  "@/lib/catalog-content"
);

function stats(coasterId: number, partial: Partial<CommunityCoasterStats>): CommunityCoasterStats {
  return { coasterId, riderCount: null, ratingCount: null, averageRating: null, wishlistCount: null, ...partial };
}

describe("catalog indexing rule", () => {
  const communityStats = new Map<number, CommunityCoasterStats>([
    [20, stats(20, { riderCount: 40, wishlistCount: 12 })],
    [30, stats(30, { riderCount: 9, ratingCount: 6, averageRating: 4.5 })],
    [40, stats(40, { ratingCount: 3, averageRating: 5 })],
  ]);

  it("indexes a coaster with a hand-written note", () => {
    expect(isCoasterCatalogSubstantial({ id: 10 })).toBe(true);
    expect(isCoasterCatalogSubstantial({ id: 10 }, null)).toBe(true);
  });

  it("does not index a coaster for rider or wishlist counts alone", () => {
    expect(isCoasterCatalogSubstantial({ id: 20 }, communityStats)).toBe(false);
  });

  it("indexes a coaster with public member ratings", () => {
    expect(isCoasterCatalogSubstantial({ id: 30 }, communityStats)).toBe(true);
  });

  it("ignores rating counts under the anonymity threshold", () => {
    expect(isCoasterCatalogSubstantial({ id: 40 }, communityStats)).toBe(false);
  });

  it("does not index a coaster with neither", () => {
    expect(isCoasterCatalogSubstantial({ id: 50 }, communityStats)).toBe(false);
    expect(isCoasterCatalogSubstantial({ id: 50 }, null)).toBe(false);
  });

  it("indexes a park with its own note, even with no qualifying rides", () => {
    expect(isParkCatalogSubstantial(100, [{ id: 50 }], communityStats)).toBe(true);
  });

  it("indexes a park when any of its coasters qualifies", () => {
    expect(isParkCatalogSubstantial(200, [{ id: 50 }, { id: 10 }], communityStats)).toBe(true);
    expect(isParkCatalogSubstantial(200, [{ id: 50 }, { id: 30 }], communityStats)).toBe(true);
  });

  it("indexes a park with at least three approved member reviews", () => {
    expect(isParkCatalogSubstantial(200, [{ id: 20 }], communityStats, 3)).toBe(true);
    expect(isParkCatalogSubstantial(200, [{ id: 20 }], communityStats, 2)).toBe(false);
  });

  it("does not index a park with only catalog rides", () => {
    expect(isParkCatalogSubstantial(200, [{ id: 20 }, { id: 50 }], communityStats)).toBe(false);
    expect(isParkCatalogSubstantial(200, [])).toBe(false);
  });

  it("keeps thin pages out of the index but lets crawlers follow their links", () => {
    expect(CATALOG_THIN_ROBOTS).toEqual({ index: false, follow: true });
  });
});
