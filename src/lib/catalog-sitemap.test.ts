import { describe, expect, it } from "vitest";
import type { Coaster, Park } from "@/types/domain";
import {
  SITEMAP_MAX_COASTERS,
  SITEMAP_MAX_PARKS,
  isCoasterSitemapEligible,
  selectSitemapCoasters,
  selectSitemapParks,
} from "@/lib/catalog-sitemap";

function park(partial: Partial<Park> & Pick<Park, "id" | "name">): Park {
  return {
    country: "United Kingdom",
    latitude: 52,
    longitude: -1,
    ...partial,
  };
}

function coaster(partial: Partial<Coaster> & Pick<Coaster, "id" | "park_id" | "name">): Coaster {
  return {
    coaster_type: "Steel",
    status: "Operating",
    ...partial,
  };
}

const richSummary = "A".repeat(140);

describe("sitemap eligibility", () => {
  it("rejects image-only stubs that the public catalog still treats as substantial", () => {
    expect(
      isCoasterSitemapEligible(
        coaster({ id: 1, park_id: 1, name: "Stub", image_url: "https://example.com/a.jpg" }),
      ),
    ).toBe(false);
  });

  it("accepts a Wikipedia-length summary or a fully stated ride with a photo", () => {
    expect(
      isCoasterSitemapEligible(coaster({ id: 1, park_id: 1, name: "Nemesis", summary_text: richSummary })),
    ).toBe(true);
    expect(
      isCoasterSitemapEligible(
        coaster({
          id: 2,
          park_id: 1,
          name: "Oblivion",
          image_url: "https://example.com/o.jpg",
          height_ft: 180,
          speed_mph: 68,
          length_ft: 1222,
          inversions: 0,
        }),
      ),
    ).toBe(true);
  });
});

describe("selectSitemapParks", () => {
  it("keeps well-known parks and drops tiny unknown ones", () => {
    const parks = [
      park({ id: 1, name: "Alton Towers" }),
      park({ id: 2, name: "Tiny Local Fair" }),
    ];
    const coasters = [
      coaster({ id: 10, park_id: 1, name: "Nemesis", summary_text: richSummary }),
      coaster({ id: 11, park_id: 1, name: "Oblivion", summary_text: richSummary }),
      coaster({ id: 12, park_id: 2, name: "Kiddie Loop" }),
    ];
    expect(selectSitemapParks(parks, coasters).map((p) => p.name)).toEqual(["Alton Towers"]);
  });

  it("caps the park list", () => {
    const parks = Array.from({ length: SITEMAP_MAX_PARKS + 40 }, (_, i) =>
      park({ id: i + 1, name: `Park ${String(i + 1).padStart(3, "0")}` }),
    );
    const coasters = parks.flatMap((p) =>
      [1, 2, 3, 4].map((n) =>
        coaster({
          id: p.id * 10 + n,
          park_id: p.id,
          name: `Ride ${p.id}-${n}`,
          summary_text: richSummary,
        }),
      ),
    );
    expect(selectSitemapParks(parks, coasters)).toHaveLength(SITEMAP_MAX_PARKS);
  });
});

describe("selectSitemapCoasters", () => {
  it("prefers rides at selected parks, then fills from the rest", () => {
    const selected = new Set([1]);
    const rows = [
      coaster({ id: 1, park_id: 1, name: "Alpha", summary_text: richSummary }),
      coaster({ id: 2, park_id: 9, name: "Zulu", summary_text: `${richSummary} extra` }),
    ];
    expect(selectSitemapCoasters(rows, { parkIds: selected, limit: 1 }).map((c) => c.name)).toEqual([
      "Alpha",
    ]);
  });

  it("caps the coaster list", () => {
    const rows = Array.from({ length: SITEMAP_MAX_COASTERS + 50 }, (_, i) =>
      coaster({
        id: i + 1,
        park_id: 1,
        name: `Ride ${String(i + 1).padStart(3, "0")}`,
        summary_text: richSummary,
      }),
    );
    expect(selectSitemapCoasters(rows)).toHaveLength(SITEMAP_MAX_COASTERS);
  });
});
