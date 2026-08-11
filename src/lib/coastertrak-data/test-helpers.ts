import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

export function makeRow(
  overrides: Partial<WikidataCoasterRow> & Pick<WikidataCoasterRow, "wikidataId" | "label">,
): WikidataCoasterRow {
  return {
    latitude: null,
    longitude: null,
    countryLabel: null,
    parkLabel: null,
    parkWikidataId: null,
    manufacturerLabel: null,
    lengthM: null,
    speedMs: null,
    heightM: null,
    durationS: null,
    openingDate: null,
    retirementDate: null,
    demolishedDate: null,
    rcdbId: null,
    enwikiTitle: null,
    imageUrl: null,
    status: "unknown",
    speedMph: null,
    lengthFt: null,
    heightFt: null,
    coasterTypeLabel: null,
    inversions: null,
    ...overrides,
  };
}
