import { describe, expect, it } from "vitest";
import {
  dedupeParksForCatalog,
  hasSharedDistinctiveParkToken,
  parkNamesMatch,
} from "@/lib/park-match";

describe("parkNamesMatch", () => {
  it("still matches obvious name variants", () => {
    expect(parkNamesMatch("Europa Park", "Europa-Park")).toBe(true);
    expect(parkNamesMatch("Six Flags Mexico", "Six Flags México")).toBe(true);
  });

  it("does not treat shared place words as the same park", () => {
    expect(parkNamesMatch("Hong Kong Disneyland", "Ocean Park Hong Kong")).toBe(false);
    expect(hasSharedDistinctiveParkToken("Hong Kong Disneyland", "Ocean Park Hong Kong")).toBe(
      false,
    );
  });
});

describe("dedupeParksForCatalog", () => {
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
