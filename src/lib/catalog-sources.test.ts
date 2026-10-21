import { describe, expect, it } from "vitest";
import {
  coasterMissingFields,
  coasterSourceLinks,
  correctionMailto,
  enwikiArticleUrl,
  parkDataCoverage,
  wikidataItemUrl,
} from "./catalog-sources";
import { buildParkEditorialIntro, computeParkHighlights } from "./catalog-content";
import type { Coaster } from "@/types/domain";

function makeCoaster(partial: Partial<Coaster>): Coaster {
  return {
    id: 1,
    park_id: 1,
    name: "Example Coaster",
    coaster_type: "Steel",
    manufacturer: "Intamin",
    status: "Operating",
    wikidata_id: "Q123",
    image_url: "https://upload.wikimedia.org/example.jpg",
    length_ft: 1000,
    speed_mph: 50,
    height_ft: 100,
    inversions: 0,
    duration_s: 90,
    opening_year: 2000,
    closing_year: null,
    ...partial,
  };
}

describe("source links", () => {
  it("only links well-formed Wikidata ids", () => {
    expect(wikidataItemUrl("Q42")).toBe("https://www.wikidata.org/wiki/Q42");
    expect(wikidataItemUrl("42")).toBeNull();
    expect(wikidataItemUrl("Q42/../evil")).toBeNull();
  });

  it("encodes Wikipedia titles", () => {
    expect(enwikiArticleUrl("Wicker Man (roller coaster)")).toBe(
      "https://en.wikipedia.org/wiki/Wicker_Man_(roller_coaster)",
    );
  });

  it("lists Wikidata, Wikipedia and RCDB in order", () => {
    const links = coasterSourceLinks({
      wikidata_id: "Q1",
      enwiki_title: "Abyss (roller coaster)",
      rcdb_id: "11665",
    });
    expect(links.map((l) => l.label)).toEqual(["Wikidata Q1", "Wikipedia article", "RCDB #11665"]);
  });
});

describe("coasterMissingFields", () => {
  it("is empty for a complete record", () => {
    expect(coasterMissingFields(makeCoaster({}))).toEqual([]);
  });

  it("names unconfirmed status and missing stats", () => {
    expect(
      coasterMissingFields(makeCoaster({ status: "Unknown", duration_s: null, image_url: null })),
    ).toEqual(["operating status", "ride duration", "photo"]);
  });
});

describe("park counts with unconfirmed statuses", () => {
  const lineup = [
    makeCoaster({ id: 1, name: "Open One", status: "Operating" }),
    makeCoaster({ id: 2, name: "Mystery", status: "Unknown", wikidata_id: null }),
    makeCoaster({ id: 3, name: "Gone", status: "Removed", closing_year: 2012, height_ft: 999 }),
  ];

  it("does not count unconfirmed rides as operating", () => {
    const h = computeParkHighlights(lineup);
    expect(h.operatingCount).toBe(1);
    expect(h.defunctCount).toBe(1);
    expect(h.unconfirmedCount).toBe(1);
  });

  it("does not pick a defunct ride as notable at an open park", () => {
    expect(computeParkHighlights(lineup).tallest?.name).not.toBe("Gone");
  });

  it("says how many statuses are unconfirmed in the intro", () => {
    expect(buildParkEditorialIntro("Test Park", "United Kingdom", lineup)).toContain(
      "1 as operating, 1 as defunct or historical and 1 without a confirmed status yet",
    );
  });

  it("summarises data coverage", () => {
    expect(parkDataCoverage(lineup)).toEqual({
      total: 3,
      linkedToWikidata: 2,
      statusConfirmed: 2,
      withHeight: 3,
      withPhoto: 3,
    });
  });
});

describe("correctionMailto", () => {
  it("prefills the subject and page URL", () => {
    const href = correctionMailto("Abyss at Adventure World", "https://coastertrak.com/coasters/abyss-1071");
    expect(href.startsWith("mailto:hello@coastertrak.com?subject=Catalog%20correction%3A%20Abyss")).toBe(true);
    expect(decodeURIComponent(href)).toContain("Page: https://coastertrak.com/coasters/abyss-1071");
  });
});
