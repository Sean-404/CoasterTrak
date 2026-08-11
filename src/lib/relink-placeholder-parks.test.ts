import { describe, expect, it } from "vitest";
import {
  mergeCoasterFields,
  planPlaceholderParkRelinks,
  resolveParkForWikidataRow,
} from "@/lib/relink-placeholder-parks";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

const parks = [
  {
    id: 8,
    name: "Other",
    country: "United States",
    latitude: 40.57,
    longitude: -73.97,
  },
  {
    id: 115,
    name: "Six Flags Great America",
    country: "United States",
    latitude: 42.36,
    longitude: -87.93,
    external_source: "wikidata",
    external_id: "Q611275",
  },
  {
    id: 50,
    name: "Cedar Point",
    country: "United States",
    latitude: 41.48,
    longitude: -82.68,
  },
];

function wd(partial: Partial<WikidataCoasterRow> & Pick<WikidataCoasterRow, "wikidataId" | "label">): WikidataCoasterRow {
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
    ...partial,
  };
}

describe("resolveParkForWikidataRow", () => {
  it("resolves by park Q-id and label", () => {
    expect(
      resolveParkForWikidataRow(
        {
          parkLabel: "Six Flags Great America",
          parkWikidataId: "Q611275",
          countryLabel: "United States",
          latitude: 42.36,
          longitude: -87.93,
        },
        parks,
      )?.id,
    ).toBe(115);
  });

  it("ignores Other as a target", () => {
    expect(
      resolveParkForWikidataRow(
        {
          parkLabel: "Other",
          parkWikidataId: null,
          countryLabel: "United States",
          latitude: 40.57,
          longitude: -73.97,
        },
        parks,
      ),
    ).toBeNull();
  });
});

describe("planPlaceholderParkRelinks", () => {
  it("moves when target has no twin", () => {
    const plans = planPlaceholderParkRelinks({
      parks,
      coasters: [
        {
          id: 1,
          name: "Gemini",
          park_id: 8,
          wikidata_id: "Q1501093",
          height_ft: 125,
        },
      ],
      wdByQid: new Map([
        [
          "Q1501093",
          wd({
            wikidataId: "Q1501093",
            label: "Gemini",
            parkLabel: "Cedar Point",
            countryLabel: "United States",
            latitude: 41.48,
            longitude: -82.68,
          }),
        ],
      ]),
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      action: "move",
      coasterId: 1,
      toParkId: 50,
      toParkName: "Cedar Point",
    });
  });

  it("merges enriched Other row into null-WD stub at real park", () => {
    const plans = planPlaceholderParkRelinks({
      parks,
      coasters: [
        {
          id: 183,
          name: "American Eagle",
          park_id: 8,
          wikidata_id: "Q464043",
          height_ft: 127,
          image_url: "https://example.com/a.jpg",
        },
        {
          id: 9693,
          name: "American Eagle",
          park_id: 115,
          wikidata_id: null,
        },
      ],
      wdByQid: new Map([
        [
          "Q464043",
          wd({
            wikidataId: "Q464043",
            label: "American Eagle",
            parkLabel: "Six Flags Great America",
            parkWikidataId: "Q611275",
            countryLabel: "United States",
            latitude: 42.36,
            longitude: -87.93,
          }),
        ],
      ]),
    });
    expect(plans[0]).toMatchObject({
      action: "merge",
      keepId: 183,
      dropId: 9693,
      toParkId: 115,
    });
  });
});

describe("mergeCoasterFields", () => {
  it("prefers existing keep values and fills gaps from donor", () => {
    expect(
      mergeCoasterFields(
        { id: 1, name: "A", park_id: 1, wikidata_id: null, height_ft: 10 },
        { id: 2, name: "A", park_id: 2, wikidata_id: "Q1", height_ft: 20, speed_mph: 50 },
      ),
    ).toMatchObject({
      wikidata_id: "Q1",
      height_ft: 10,
      speed_mph: 50,
    });
  });
});
