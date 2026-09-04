import { describe, expect, it } from "vitest";

import {
  hasUsableWikidataCoasterName,
  wikidataInsertName,
} from "@/lib/wikidata-coaster-inference";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

function row(
  partial: Partial<WikidataCoasterRow> & Pick<WikidataCoasterRow, "wikidataId" | "label">,
): WikidataCoasterRow {
  return {
    wikidataId: partial.wikidataId,
    label: partial.label,
    status: "operating",
    parkLabel: partial.parkLabel ?? null,
    parkWikidataId: null,
    countryLabel: null,
    manufacturerLabel: null,
    coasterTypeLabel: null,
    latitude: null,
    longitude: null,
    lengthM: null,
    speedMs: null,
    heightM: null,
    durationS: null,
    lengthFt: null,
    speedMph: null,
    heightFt: null,
    inversions: null,
    openingDate: null,
    retirementDate: null,
    demolishedDate: null,
    rcdbId: null,
    enwikiTitle: partial.enwikiTitle ?? null,
    imageUrl: null,
  };
}

describe("wikidataInsertName", () => {
  it("prefers enwiki title over Wikidata label", () => {
    expect(
      wikidataInsertName(
        row({ wikidataId: "Q1", label: "Zipper Dipper", enwikiTitle: "Blue Flyer" }),
      ),
    ).toBe("Blue Flyer");
  });

  it("keeps label when enwiki looks like an incident article", () => {
    expect(
      wikidataInsertName(
        row({
          wikidataId: "Q1",
          label: "Big Dipper",
          enwikiTitle: "Battersea Park funfair disaster",
        }),
      ),
    ).toBe("Big Dipper");
  });
});

describe("hasUsableWikidataCoasterName", () => {
  it("rejects bare Q-id labels", () => {
    expect(hasUsableWikidataCoasterName(row({ wikidataId: "Q19765421", label: "Q19765421" }))).toBe(
      false,
    );
  });

  it("accepts human labels", () => {
    expect(hasUsableWikidataCoasterName(row({ wikidataId: "Q19765421", label: "Alpenblitz" }))).toBe(
      true,
    );
  });

  it("accepts enwiki title when label is a Q-id", () => {
    expect(
      hasUsableWikidataCoasterName(
        row({ wikidataId: "Q1", label: "Q1", enwikiTitle: "Dragon Wagon" }),
      ),
    ).toBe(true);
  });
});
