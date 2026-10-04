import { describe, expect, it } from "vitest";
import { coasterPublicFieldsChanged } from "@/lib/coasters-external-upsert";

const base = {
  id: 1,
  park_id: 10,
  external_source: "wikidata",
  external_id: "Q1",
  name: "Nemesis",
  wikidata_id: "Q1",
  rcdb_id: 123,
  coaster_type: "Steel",
  manufacturer: "B&M",
  image_url: "https://example.com/a.jpg",
  status: "Operating",
  length_ft: 2000,
  speed_mph: 50,
  height_ft: 100,
  inversions: 4,
  duration_s: 90,
  opening_year: 1994,
  closing_year: null,
  enwiki_title: "Nemesis (roller coaster)",
};

describe("coasterPublicFieldsChanged", () => {
  it("returns false when public fields match", () => {
    expect(
      coasterPublicFieldsChanged(base, {
        ...base,
        last_synced_at: "2026-10-04T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("returns true when a public field changes", () => {
    expect(
      coasterPublicFieldsChanged(base, {
        ...base,
        height_ft: 120,
      }),
    ).toBe(true);
  });
});
