import { describe, expect, it } from "vitest";
import type { Coaster, Park } from "@/types/domain";
import {
  buildParkEditorialIntro,
  isCoasterCatalogSubstantial,
  isParkCatalogSubstantial,
} from "@/lib/catalog-content";
import {
  normalizeCatalog,
  serializeNormalizedCatalog,
  deserializeNormalizedCatalog,
} from "@/lib/catalog-normalize";

describe("normalizeCatalog", () => {
  it("keeps Hong Kong Disneyland and Ocean Park as separate parks", () => {
    const parks: Park[] = [
      {
        id: 244,
        name: "Hong Kong Disneyland",
        country: "Hong Kong",
        latitude: 22.3102,
        longitude: 114.0425,
      },
      {
        id: 239,
        name: "Ocean Park Hong Kong",
        country: "Hong Kong",
        latitude: 22.2357,
        longitude: 114.1725,
      },
    ];
    const normalized = normalizeCatalog(parks, [
      {
        id: 1,
        park_id: 244,
        name: "Big Grizzly Mountain",
        coaster_type: "Steel",
        status: "Operating",
      },
      {
        id: 2,
        park_id: 239,
        name: "Hair Raiser",
        coaster_type: "Steel",
        status: "Operating",
      },
    ]);
    expect(normalized.parks.map((p) => p.name).sort()).toEqual([
      "Hong Kong Disneyland",
      "Ocean Park Hong Kong",
    ]);
    expect(normalized.idRemap.size).toBe(0);
  });

  it("remaps coasters from absorbed geocode park rows to the real resort", () => {
    const parks: Park[] = [
      {
        id: 1,
        name: "Alton Towers",
        country: "United Kingdom",
        latitude: 52.987,
        longitude: -1.89,
      },
      {
        id: 2,
        name: "Alton, Staffordshire, England",
        country: "United Kingdom",
        latitude: 52.986,
        longitude: -1.891,
      },
    ];
    const coasters: Coaster[] = [
      {
        id: 10,
        park_id: 2,
        name: "Nemesis",
        coaster_type: "Steel",
        status: "Operating",
      },
    ];

    const normalized = normalizeCatalog(parks, coasters);
    expect(normalized.parks.some((p) => p.id === 2)).toBe(false);
    expect(normalized.coasters[0]?.park_id).toBe(1);
    expect(normalized.idRemap.get(2)).toBe(1);
  });

  it("round-trips through cache-safe serialization", () => {
    const parks: Park[] = [
      { id: 1, name: "Alton Towers", country: "United Kingdom", latitude: 52.987, longitude: -1.89 },
      {
        id: 2,
        name: "Alton, Staffordshire, England",
        country: "United Kingdom",
        latitude: 52.986,
        longitude: -1.891,
      },
    ];
    const normalized = normalizeCatalog(parks, []);
    const json = JSON.parse(JSON.stringify(serializeNormalizedCatalog(normalized)));
    const restored = deserializeNormalizedCatalog(json);
    expect(restored.idRemap).toBeInstanceOf(Map);
    expect(restored.idRemap.get(2)).toBe(1);
  });
});

describe("catalog content helpers", () => {
  it("marks coasters with image or stats as substantial", () => {
    expect(
      isCoasterCatalogSubstantial({
        id: 1,
        park_id: 1,
        name: "Test",
        coaster_type: "Steel",
        status: "Operating",
        height_ft: 100,
        speed_mph: 50,
      }),
    ).toBe(true);
    expect(
      isCoasterCatalogSubstantial({
        id: 1,
        park_id: 1,
        name: "Stub",
        coaster_type: "Unknown",
        status: "Operating",
      }),
    ).toBe(false);
  });

  it("builds a park intro from coaster stats", () => {
    const intro = buildParkEditorialIntro("Alton Towers", "England", [
      {
        id: 1,
        park_id: 1,
        name: "Nemesis",
        coaster_type: "Steel",
        status: "Operating",
        height_ft: 42,
        speed_mph: 50,
      },
      {
        id: 2,
        park_id: 1,
        name: "Oblivion",
        coaster_type: "Steel",
        status: "Operating",
        speed_mph: 68,
      },
    ]);
    expect(intro).toContain("Alton Towers");
    expect(intro).toContain("2 roller coasters");
    expect(isParkCatalogSubstantial([], intro)).toBe(true);
  });
});
