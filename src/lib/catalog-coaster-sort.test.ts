import { describe, expect, it } from "vitest";
import { filterAndSortCoasters, isCoasterDefunct, uniqueCoasterTypes } from "./catalog-coaster-sort";
import type { Coaster } from "@/types/domain";

function coaster(partial: Partial<Coaster> & Pick<Coaster, "id" | "name">): Coaster {
  return {
    park_id: 1,
    coaster_type: "Steel",
    manufacturer: null,
    status: "Operating",
    height_ft: null,
    length_ft: null,
    speed_mph: null,
    inversions: null,
    duration_s: null,
    opening_year: null,
    closing_year: null,
    image_url: null,
    wikidata_id: null,
    enwiki_title: null,
    summary_text: null,
    ...partial,
  };
}

describe("catalog-coaster-sort", () => {
  const rows = [
    coaster({ id: 1, name: "Alpha", speed_mph: 50, height_ft: 100, coaster_type: "Steel" }),
    coaster({ id: 2, name: "Beta", speed_mph: 70, height_ft: 80, coaster_type: "Wood" }),
    coaster({
      id: 3,
      name: "Gamma",
      speed_mph: 60,
      height_ft: 120,
      coaster_type: "Steel",
      status: "Defunct",
      closing_year: 2020,
    }),
  ];

  it("puts alphabetically-earlier defunct rides after operating ones", () => {
    const mixed = [
      coaster({ id: 9, name: "Zebra", status: "Operating" }),
      coaster({ id: 8, name: "Aardvark", status: "Defunct", closing_year: 1999 }),
    ];
    expect(filterAndSortCoasters(mixed, { sort: "name" }).map((c) => c.name)).toEqual([
      "Zebra",
      "Aardvark",
    ]);
  });

  it("sorts by name with defunct last when showing all", () => {
    expect(filterAndSortCoasters(rows, { sort: "name" }).map((c) => c.name)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("keeps defunct last when sorting by speed", () => {
    expect(filterAndSortCoasters(rows, { sort: "speed" }).map((c) => c.name)).toEqual([
      "Beta",
      "Alpha",
      "Gamma",
    ]);
  });

  it("sorts defunct-only lists alphabetically", () => {
    expect(
      filterAndSortCoasters(rows, { statusFilter: "defunct", sort: "name" }).map((c) => c.name),
    ).toEqual(["Gamma"]);
  });

  it("filters operating coasters", () => {
    expect(filterAndSortCoasters(rows, { statusFilter: "operating" }).map((c) => c.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("filters by type", () => {
    expect(filterAndSortCoasters(rows, { typeFilter: "wood" }).map((c) => c.name)).toEqual(["Beta"]);
  });

  it("detects defunct coasters", () => {
    expect(isCoasterDefunct(rows[2])).toBe(true);
    expect(isCoasterDefunct(rows[0])).toBe(false);
  });

  it("lists unique coaster types", () => {
    expect(uniqueCoasterTypes(rows)).toEqual(["Steel", "Wood"]);
  });
});
