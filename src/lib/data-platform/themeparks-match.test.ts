import { describe, expect, it } from "vitest";

import { buildAliasLookup } from "@/lib/data-platform/coaster-aliases";
import {
  buildThemeParksMatchReport,
  isLikelyCoasterAttractionName,
  matchParkCoastersToThemeParks,
  themeParksAttractionMatchKey,
} from "@/lib/data-platform/themeparks-match";
import {
  stripThemeParksFeedDecorations,
} from "@/lib/data-platform/themeparks-match-normalize";
import type { ThemeParksChildEntity } from "@/lib/themeparks-wiki";

const emptyAliases = buildAliasLookup([]);

function attraction(id: string, name: string): ThemeParksChildEntity {
  return { id, name, entityType: "ATTRACTION" };
}

function parkRow(id: number, name: string) {
  return { id, name, country: "US", latitude: 0, longitude: 0 };
}

describe("stripThemeParksFeedDecorations", () => {
  it("drops maintenance and marketing suffixes", () => {
    expect(stripThemeParksFeedDecorations("Coastersaurus - Currently Closed for Maintenance")).toBe(
      "Coastersaurus",
    );
    expect(stripThemeParksFeedDecorations("New: Cornwall Coaster")).toBe("Cornwall Coaster");
    expect(stripThemeParksFeedDecorations("Ride It Backwards - DC Rivals Hypercoaster")).toBe(
      "DC Rivals Hypercoaster",
    );
    expect(stripThemeParksFeedDecorations("Eejanaika - 4th Dimension Hypercoaster")).toBe("Eejanaika");
    expect(stripThemeParksFeedDecorations("100% Wolf – The family roller coaster")).toBe("100% Wolf");
    expect(stripThemeParksFeedDecorations("THE DARK KNIGHT™ Coaster")).toBe("THE DARK KNIGHT Coaster");
  });
});

describe("isLikelyCoasterAttractionName", () => {
  it("ignores water coasters and joke names", () => {
    expect(isLikelyCoasterAttractionName("Breakers Edge Water Coaster")).toBe(false);
    expect(isLikelyCoasterAttractionName("Speed Water Coaster")).toBe(false);
    expect(isLikelyCoasterAttractionName("Almost Like a Roller Coaster V")).toBe(false);
  });

  it("still flags real coasters", () => {
    expect(isLikelyCoasterAttractionName("Pepsi Hyperion")).toBe(true);
    expect(isLikelyCoasterAttractionName("Big Thunder Mountain")).toBe(true);
  });
});

describe("matchParkCoastersToThemeParks", () => {
  it("matches Pepsi Hyperion to Hyperion", () => {
    const result = matchParkCoastersToThemeParks({
      park: parkRow(266, "Energylandia"),
      coasters: [
        {
          id: 1291,
          park_id: 266,
          name: "Hyperion",
          status: "Operating",
          coaster_type: "Steel",
          wikidata_id: null,
        },
      ],
      themeParksParkId: "tp-energy",
      themeParksParkName: "Energylandia",
      parkMatchMethod: "auto",
      attractions: [attraction("tp-hyperion", "Pepsi Hyperion")],
      aliasLookup: emptyAliases,
    });
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.coasterId).toBe(1291);
    expect(result.sourceOnly.filter((s) => s.likelyCoaster)).toHaveLength(0);
  });

  it("matches Fuji-Q marketing titles to catalog names", () => {
    const result = matchParkCoastersToThemeParks({
      park: parkRow(4, "Fuji-Q Highland"),
      coasters: [
        { id: 6, park_id: 4, name: "Eejanaika", status: "Operating", coaster_type: "Steel", wikidata_id: null },
        { id: 4392, park_id: 4, name: "Takabisha", status: "Operating", coaster_type: "Steel", wikidata_id: null },
      ],
      themeParksParkId: "tp-fuji",
      themeParksParkName: "Fuji-Q Highland",
      parkMatchMethod: "auto",
      attractions: [
        attraction("a", "Eejanaika - 4th Dimension Hypercoaster"),
        attraction("b", "Takabisha - Steepest Roller Coaster"),
      ],
      aliasLookup: emptyAliases,
    });
    expect(result.matched.map((m) => m.coasterName).sort()).toEqual(["Eejanaika", "Takabisha"]);
  });

  it("matches Gadget's Go Coaster to Chip 'n' Dale's Gadgetcoaster", () => {
    const result = matchParkCoastersToThemeParks({
      park: parkRow(344, "Tokyo Disneyland"),
      coasters: [
        {
          id: 344,
          park_id: 344,
          name: "Chip 'n' Dale's Gadgetcoaster",
          status: "Operating",
          coaster_type: "Steel",
          wikidata_id: null,
        },
      ],
      themeParksParkId: "tp-tdl",
      themeParksParkName: "Tokyo Disneyland",
      parkMatchMethod: "auto",
      attractions: [attraction("g", "Gadget's Go Coaster")],
      aliasLookup: emptyAliases,
    });
    expect(result.matched).toHaveLength(1);
  });

  it("does not flag Ride It Backwards as a missing coaster once the ride is matched", () => {
    const result = matchParkCoastersToThemeParks({
      park: parkRow(143, "Warner Bros. Movie World"),
      coasters: [
        {
          id: 1252,
          park_id: 143,
          name: "DC Rivals HyperCoaster",
          status: "Operating",
          coaster_type: "Steel",
          wikidata_id: null,
        },
      ],
      themeParksParkId: "tp-mw",
      themeParksParkName: "Warner Bros. Movie World",
      parkMatchMethod: "auto",
      attractions: [
        attraction("fwd", "DC Rivals HyperCoaster"),
        attraction("rev", "Ride It Backwards - DC Rivals Hypercoaster"),
      ],
      aliasLookup: emptyAliases,
    });
    expect(result.matched).toHaveLength(1);
    expect(result.sourceOnly.filter((s) => s.likelyCoaster)).toHaveLength(0);
  });

  it("matches Racing Coaster to the longer catalog name", () => {
    const result = matchParkCoastersToThemeParks({
      park: parkRow(126, "Everland"),
      coasters: [
        {
          id: 15564,
          park_id: 126,
          name: "Herky and Timmy's Racing Coaster",
          status: "Operating",
          coaster_type: "Steel",
          wikidata_id: null,
        },
      ],
      themeParksParkId: "tp-ever",
      themeParksParkName: "Everland",
      parkMatchMethod: "auto",
      attractions: [attraction("r", "Racing Coaster")],
      aliasLookup: emptyAliases,
    });
    expect(result.matched).toHaveLength(1);
  });
});

describe("buildThemeParksMatchReport leaked IDs", () => {
  it("does not flag an attraction UUID already matched at another park", () => {
    const orlando = matchParkCoastersToThemeParks({
      park: parkRow(1, "SeaWorld Orlando"),
      coasters: [
        {
          id: 10,
          park_id: 1,
          name: "Pipeline: The Surf Coaster",
          status: "Operating",
          coaster_type: "Steel",
          wikidata_id: null,
        },
      ],
      themeParksParkId: "tp-orlando",
      themeParksParkName: "SeaWorld Orlando",
      parkMatchMethod: "auto",
      attractions: [attraction("pipeline-id", "Pipeline: The Surf Coaster")],
      aliasLookup: emptyAliases,
    });
    const sanDiego = matchParkCoastersToThemeParks({
      park: parkRow(2, "SeaWorld San Diego"),
      coasters: [
        {
          id: 11,
          park_id: 2,
          name: "Electric Eel",
          status: "Operating",
          coaster_type: "Steel",
          wikidata_id: null,
        },
      ],
      themeParksParkId: "tp-sd",
      themeParksParkName: "SeaWorld San Diego",
      parkMatchMethod: "auto",
      attractions: [
        attraction("eel-id", "Electric Eel"),
        attraction("pipeline-id", "Pipeline: The Surf Coaster"),
      ],
      aliasLookup: emptyAliases,
    });

    const report = buildThemeParksMatchReport([orlando, sanDiego]);
    const sd = report.parks.find((p) => p.parkId === 2);
    expect(sd?.sourceOnly.some((s) => s.themeParksId === "pipeline-id")).toBe(false);
  });
});

describe("themeParksAttractionMatchKey", () => {
  it("collapses Dark Knight trademark feed names", () => {
    expect(themeParksAttractionMatchKey("THE DARK KNIGHT™ Coaster")).toBe(
      themeParksAttractionMatchKey("The Dark Knight Coaster"),
    );
  });
});
