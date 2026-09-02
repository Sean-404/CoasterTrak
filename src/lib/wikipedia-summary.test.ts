import { describe, expect, it, vi, afterEach } from "vitest";
import { sanitizeCoasterImageUrl } from "@/lib/coaster-known-fixes";

vi.mock("@/lib/coaster-known-fixes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coaster-known-fixes")>();
  return actual;
});

describe("coaster Wikipedia helpers", () => {
  it("builds common title candidates with park disambiguation", async () => {
    const { buildCoasterEnwikiTitleCandidates } = await import("@/lib/wikipedia-summary");
    expect(buildCoasterEnwikiTitleCandidates("Bat", "Lagoon")).toEqual([
      "Bat",
      "Bat (roller coaster)",
      "Bat (Lagoon)",
    ]);
  });

  it("accepts roller-coaster articles that mention the ride name", async () => {
    const { isLikelyCoasterSummary } = await import("@/lib/wikipedia-summary");
    expect(
      isLikelyCoasterSummary("Ring Racer", {
        title: "Ring Racer",
        extract: "Ring Racer was a Formula One-themed roller coaster at the Nürburgring.",
        url: "https://en.wikipedia.org/wiki/Ring_Racer",
        imageUrl: null,
      }),
    ).toBe(true);
  });

  it("rejects unrelated articles", async () => {
    const { isLikelyCoasterSummary } = await import("@/lib/wikipedia-summary");
    expect(
      isLikelyCoasterSummary("Big Thunder Mountain Railroad", {
        title: "Tsukiji fish market",
        extract: "Tsukiji fish market was a major wholesale seafood market in Tokyo.",
        url: "https://en.wikipedia.org/wiki/Tsukiji_fish_market",
        imageUrl: null,
      }),
    ).toBe(false);
    expect(
      isLikelyCoasterSummary("Cyclone", {
        title: "Cyclone",
        extract: "In meteorology, a cyclone is a large air mass that rotates around a strong center of low pressure.",
        url: "https://en.wikipedia.org/wiki/Cyclone",
        imageUrl: null,
      }),
    ).toBe(false);
  });
});

describe("fetchWikipediaSummary image fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns sanitized originalimage from the summary API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          title: "Nemesis (roller coaster)",
          extract: "Nemesis is a steel inverted roller coaster.",
          type: "standard",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Nemesis_(roller_coaster)" } },
          originalimage: {
            source: "https://upload.wikimedia.org/wikipedia/commons/0/0a/Nemesis_Alton_Towers.jpg",
          },
        }),
      })),
    );

    const { fetchWikipediaSummary } = await import("@/lib/wikipedia-summary");
    const summary = await fetchWikipediaSummary("Nemesis (roller coaster)");
    expect(summary?.extract).toContain("Nemesis");
    expect(summary?.imageUrl).toBe(
      sanitizeCoasterImageUrl(
        "https://upload.wikimedia.org/wikipedia/commons/0/0a/Nemesis_Alton_Towers.jpg",
      ),
    );
  });

  it("returns null image when summary has no media", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          title: "Some coaster",
          extract: "A roller coaster without a lead image.",
          type: "standard",
        }),
      })),
    );

    const { fetchWikipediaSummary } = await import("@/lib/wikipedia-summary");
    const summary = await fetchWikipediaSummary("Some coaster");
    expect(summary?.imageUrl).toBeNull();
  });
});
