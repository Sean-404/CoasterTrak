import { describe, expect, it } from "vitest";
import {
  dedupeParksForCatalog,
  hasSharedDistinctiveParkToken,
  parkNamesMatch,
  parkNamesNormativelyEqual,
} from "@/lib/park-match";

describe("parkNamesMatch", () => {
  it("treats Plopsaland De Panne as Plopsaland Belgium", () => {
    expect(parkNamesMatch("Plopsaland De Panne", "Plopsaland Belgium")).toBe(true);
    expect(parkNamesMatch("Plopsaland Belgium", "Plopsaland Deutschland")).toBe(false);
  });

  it("treats Thorpe Park Resort as Thorpe Park", () => {
    expect(parkNamesMatch("Thorpe Park", "Thorpe Park Resort")).toBe(true);
    expect(parkNamesNormativelyEqual("Thorpe Park", "Thorpe Park Resort")).toBe(true);
    expect(parkNamesNormativelyEqual("Flamingo Land", "Flamingo Land Resort")).toBe(true);
  });

  it("collapses spelling / parenthetical park aliases", () => {
    expect(parkNamesNormativelyEqual("Gröna Lund", "Grona Lund")).toBe(true);
    expect(parkNamesNormativelyEqual("Fårup Sommarland", "Fårup Sommerland")).toBe(true);
    expect(parkNamesNormativelyEqual("Chime-Long Ocean Kingdom", "Chimelong Ocean Kingdom")).toBe(
      true,
    );
    expect(
      parkNamesNormativelyEqual("Fantasy Island", "Fantasy Island (UK amusement park)"),
    ).toBe(true);
    expect(parkNamesNormativelyEqual("Adlabs Imagica", "Imagicaa")).toBe(true);
  });

  it("does not treat shared place words as the same park", () => {
    expect(parkNamesMatch("Hong Kong Disneyland", "Ocean Park Hong Kong")).toBe(false);
    expect(hasSharedDistinctiveParkToken("Hong Kong Disneyland", "Ocean Park Hong Kong")).toBe(
      false,
    );
  });
});

describe("dedupeParksForCatalog", () => {
  it("hides parks whose name is a bare Wikidata Q-id", () => {
    const parks = dedupeParksForCatalog([
      {
        id: 348,
        name: "Q2197655",
        country: "Belgium",
        latitude: 50.39,
        longitude: 5.87,
        rideCount: 2,
      },
      {
        id: 267,
        name: "Walibi Belgium",
        country: "Belgium",
        latitude: 50.7,
        longitude: 4.59,
        rideCount: 10,
      },
    ]);

    expect(parks.map((p) => p.name)).toEqual(["Walibi Belgium"]);
  });

  it("keeps Thorpe Park and drops Thorpe Park Resort when ride counts differ", () => {
    const parks = dedupeParksForCatalog([
      {
        id: 155,
        name: "Thorpe Park Resort",
        country: "United Kingdom",
        latitude: 51.4036,
        longitude: -0.5132,
        rideCount: 1,
      },
      {
        id: 98,
        name: "Thorpe Park",
        country: "United Kingdom",
        latitude: 51.4039456,
        longitude: -0.5143332,
        rideCount: 7,
      },
    ]);
    expect(parks.map((p) => p.name)).toEqual(["Thorpe Park"]);
  });

  it("keeps Ocean Park and Hong Kong Disneyland as separate parks", () => {
    const parks = dedupeParksForCatalog([
      {
        id: 244,
        name: "Hong Kong Disneyland",
        country: "Hong Kong",
        latitude: 22.3102,
        longitude: 114.0425,
        rideCount: 4,
      },
      {
        id: 239,
        name: "Ocean Park Hong Kong",
        country: "Hong Kong",
        latitude: 22.2357,
        longitude: 114.1725,
        rideCount: 1,
      },
    ]);

    expect(parks.map((p) => p.name).sort()).toEqual([
      "Hong Kong Disneyland",
      "Ocean Park Hong Kong",
    ]);
  });
});
