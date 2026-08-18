import { describe, expect, it } from "vitest";

import {
  autoMatchAllCatalogParks,
  matchCatalogParkToThemeParks,
  parksHaveConflictingIdentity,
} from "@/lib/data-platform/park-auto-match";
import type { ThemeParksDestination } from "@/lib/themeparks-wiki";

function park(id: number, name: string) {
  return { id, name, country: "US", latitude: 0, longitude: 0 };
}

function destinations(
  parks: Array<{ id: string; name: string }>,
  destinationName = "Dest",
): ThemeParksDestination[] {
  return [
    {
      id: "dest",
      name: destinationName,
      parks: parks.map((p) => ({ id: p.id, name: p.name })),
    },
  ];
}

describe("parksHaveConflictingIdentity", () => {
  it("keeps California's Great America distinct from Six Flags Great America", () => {
    expect(
      parksHaveConflictingIdentity("California's Great America", "Six Flags Great America"),
    ).toBe(true);
  });

  it("keeps Wet'n'Wild distinct from Sea World", () => {
    expect(parksHaveConflictingIdentity("Wet'n'Wild Gold Coast", "Sea World")).toBe(true);
  });
});

describe("autoMatchAllCatalogParks", () => {
  it("gives Six Flags Great America the ThemeParks park, not California's Great America", () => {
    const result = autoMatchAllCatalogParks({
      catalogParks: [park(107, "California's Great America"), park(115, "Six Flags Great America")],
      destinations: destinations([{ id: "tp-gurnee", name: "Six Flags Great America" }]),
      existingLinks: [
        {
          park_id: 107,
          external_id: "tp-gurnee",
          external_name: "Six Flags Great America",
          match_method: "auto",
        },
      ],
    });

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.catalogPark.id).toBe(115);
    expect(result.matched[0]?.themeParksParkId).toBe("tp-gurnee");
    expect(result.unmapped.map((p) => p.id)).toContain(107);
  });

  it("prefers Thorpe Park over Thorpe Park Resort for the same ThemeParks entity", () => {
    const result = autoMatchAllCatalogParks({
      catalogParks: [park(155, "Thorpe Park Resort"), park(98, "Thorpe Park")],
      destinations: destinations([{ id: "tp-thorpe", name: "Thorpe Park" }]),
      existingLinks: [
        {
          park_id: 155,
          external_id: "tp-thorpe",
          external_name: "Thorpe Park",
          match_method: "auto",
        },
      ],
    });

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.catalogPark.id).toBe(98);
    expect(result.unmapped.map((p) => p.id)).toContain(155);
  });

  it("does not attach Darien Lake to Six Flags New England", () => {
    const result = autoMatchAllCatalogParks({
      catalogParks: [park(88, "Six Flags Darien Lake"), park(43, "Six Flags New England")],
      destinations: destinations([{ id: "tp-ne", name: "Six Flags New England" }]),
      existingLinks: [],
    });
    expect(result.matched.map((m) => m.catalogPark.id)).toEqual([43]);
    expect(result.unmapped.map((p) => p.id)).toContain(88);
  });

  it("does not attach Glenwood Caverns to Islands of Adventure", () => {
    const result = autoMatchAllCatalogParks({
      catalogParks: [park(282, "Glenwood Caverns Adventure Park")],
      destinations: destinations([{ id: "tp-ioa", name: "Universal Islands of Adventure" }]),
      existingLinks: [],
    });
    expect(result.matched).toHaveLength(0);
  });

  it("does not attach Qiddiya to Fiesta Texas", () => {
    const result = autoMatchAllCatalogParks({
      catalogParks: [park(361, "Six Flags Qiddiya City"), park(132, "Six Flags Fiesta Texas")],
      destinations: destinations([{ id: "tp-fiesta", name: "Six Flags Fiesta Texas" }]),
      existingLinks: [],
    });
    expect(result.matched.map((m) => m.catalogPark.id)).toEqual([132]);
    expect(result.unmapped.map((p) => p.id)).toContain(361);
  });

  it("does not attach Wet'n'Wild to a Sea World ThemeParks park", () => {
    const result = autoMatchAllCatalogParks({
      catalogParks: [park(218, "Wet'n'Wild Gold Coast")],
      destinations: destinations([{ id: "tp-seaworld", name: "Sea World" }], "Wet'n'Wild Gold Coast"),
      existingLinks: [
        {
          park_id: 218,
          external_id: "tp-seaworld",
          external_name: "Sea World",
          match_method: "auto",
        },
      ],
    });

    expect(result.matched).toHaveLength(0);
    expect(result.unmapped.map((p) => p.id)).toEqual([218]);
  });
});

describe("matchCatalogParkToThemeParks", () => {
  it("ignores a cached link to a conflicting park name", () => {
    const result = matchCatalogParkToThemeParks({
      catalogPark: park(107, "California's Great America"),
      candidates: [
        {
          id: "tp-gurnee",
          name: "Six Flags Great America",
          destinationName: "Six Flags",
        },
      ],
      existingLink: {
        park_id: 107,
        external_id: "tp-gurnee",
        external_name: "Six Flags Great America",
        match_method: "auto",
      },
    });
    expect(result).toBeNull();
  });
});
