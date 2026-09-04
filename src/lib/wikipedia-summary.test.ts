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

  it("accepts family coasters whose lead mentions an amusement park", async () => {
    const { isLikelyCoasterSummary } = await import("@/lib/wikipedia-summary");
    expect(
      isLikelyCoasterSummary("Freedom Flyer", {
        title: "Freedom Flyer",
        extract:
          "Freedom Flyer is a Suspended Family Coaster at the Fun Spot America amusement park in Orlando, Florida.",
        url: "https://en.wikipedia.org/wiki/Freedom_Flyer",
        imageUrl: null,
      }),
    ).toBe(true);
  });

  it("allows Disaster Transport despite disaster in the ride name", async () => {
    const { isLikelyCoasterSummary } = await import("@/lib/wikipedia-summary");
    expect(
      isLikelyCoasterSummary("Disaster Transport", {
        title: "Disaster Transport",
        extract:
          "Disaster Transport was an enclosed roller coaster at Cedar Point in Sandusky, Ohio.",
        url: "https://en.wikipedia.org/wiki/Disaster_Transport",
        imageUrl: null,
      }),
    ).toBe(true);
  });

  it("rejects Wikipedia coaster-type taxonomy pages", async () => {
    const { isLikelyCoasterSummary, isGenericCoasterTypeArticle } = await import(
      "@/lib/wikipedia-summary"
    );
    expect(isGenericCoasterTypeArticle("Launched roller coaster")).toBe(true);
    expect(
      isLikelyCoasterSummary("Launch Pad", {
        title: "Launched roller coaster",
        extract:
          "The launched roller coaster is a type of roller coaster that initiates a ride with high amounts of acceleration via one or a series of linear induction motors (LIM).",
        url: "https://en.wikipedia.org/wiki/Launched_roller_coaster",
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
