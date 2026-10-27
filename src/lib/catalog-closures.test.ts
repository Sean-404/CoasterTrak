import { describe, expect, it } from "vitest";
import type { Coaster, Park } from "@/types/domain";
import { applyParkScopedFixes } from "@/lib/catalog-closures";
import { normalizeCatalog } from "@/lib/catalog-normalize";
import { coasterStatusDisplay } from "@/lib/coaster-status";

function coaster(partial: Partial<Coaster>): Coaster {
  return {
    id: 1,
    park_id: 1,
    name: "Example",
    coaster_type: "Steel",
    status: "Operating",
    opening_year: null,
    closing_year: null,
    ...partial,
  };
}

describe("applyParkScopedFixes", () => {
  it("marks every ride at a closed park defunct with the park's closing year", () => {
    const fixed = applyParkScopedFixes(
      coaster({ name: "The Wild One (roller coaster)", opening_year: 1917 }),
      "Six Flags America",
    );
    expect(coasterStatusDisplay(fixed).label).toBe("Defunct · 2025");
  });

  it("keeps an earlier ride-specific closing year at a closed park", () => {
    const fixed = applyParkScopedFixes(
      coaster({ name: "Lightnin' Loops", status: "Defunct", opening_year: 1990, closing_year: 1998 }),
      "Six Flags America",
    );
    expect(fixed.closing_year).toBe(1998);
  });

  it("corrects a former installation that inherited its later home's status", () => {
    const fixed = applyParkScopedFixes(
      coaster({ name: "Wildcat (Jolly Roger Amusement Park)", opening_year: 1979 }),
      "Cedar Point",
    );
    expect(fixed).toMatchObject({ status: "Defunct", opening_year: 1970, closing_year: 1978 });
    expect(coasterStatusDisplay(fixed).label).toBe("Defunct · 1978");
  });

  it("leaves the same ride alone at its current park", () => {
    const row = coaster({ name: "Corkscrew (Silverwood)", opening_year: 1990 });
    expect(applyParkScopedFixes(row, "Silverwood Theme Park")).toBe(row);
  });

  it("renames the Geauga Lake installation to its name there", () => {
    const fixed = applyParkScopedFixes(coaster({ name: "Roller Coaster (Papéa Parc)" }), "Geauga Lake");
    expect(fixed).toMatchObject({ name: "Beaver Land Mine Ride", status: "Defunct", closing_year: 2007 });
  });
});

describe("normalizeCatalog applies park-scoped fixes", () => {
  it("fixes rows by the park they are attached to", () => {
    const parks: Park[] = [
      { id: 2, name: "Cedar Point", country: "United States", latitude: 41.48, longitude: -82.68 },
      { id: 17, name: "Six Flags America", country: "United States", latitude: 38.9, longitude: -76.77 },
    ];
    const { coasters } = normalizeCatalog(parks, [
      coaster({ id: 10, park_id: 2, name: "Wildcat (Jolly Roger Amusement Park)", opening_year: 1979 }),
      coaster({ id: 11, park_id: 2, name: "Millennium Force", opening_year: 2000 }),
      coaster({ id: 12, park_id: 17, name: "Batgirl Batarang" }),
    ]);
    const byId = new Map(coasters.map((c) => [c.id, c]));
    expect(byId.get(10)?.status).toBe("Defunct");
    expect(byId.get(11)?.status).toBe("Operating");
    expect(byId.get(12)?.status).toBe("Defunct");
  });
});

describe("misattributed rows", () => {
  it("hides Jumbo Jet from Rye Playland, a park it never ran at", () => {
    const parks: Park[] = [
      { id: 40, name: "Playland", country: "United States", latitude: 40.97, longitude: -73.67 },
    ];
    const { coasters } = normalizeCatalog(parks, [
      coaster({ id: 15817, park_id: 40, name: "Jumbo Jet (Chelyuskintsev Park)" }),
      coaster({ id: 1, park_id: 40, name: "Dragon Coaster" }),
    ]);
    expect(coasters.map((c) => c.id)).toEqual([1]);
  });

  it("hides infobox mismatches but keeps the rides at their real parks", () => {
    const parks: Park[] = [
      { id: 14, name: "Luna Park Melbourne", country: "Australia", latitude: -37.87, longitude: 144.98 },
      { id: 20, name: "Dreamland Margate", country: "United Kingdom", latitude: 51.39, longitude: 1.38 },
      { id: 61, name: "Six Flags AstroWorld", country: "United States", latitude: 29.68, longitude: -95.41 },
      { id: 64, name: "Six Flags Magic Mountain", country: "United States", latitude: 34.42, longitude: -118.6 },
      { id: 88, name: "Six Flags Darien Lake", country: "United States", latitude: 42.93, longitude: -78.38 },
    ];
    const { coasters } = normalizeCatalog(parks, [
      coaster({ id: 22, park_id: 14, name: "The Great Scenic Railway" }),
      coaster({ id: 31, park_id: 20, name: "The Great Scenic Railway" }),
      coaster({ id: 15586, park_id: 20, name: "Scenic Railway", wikidata_id: "Q2229130", opening_year: 1912 }),
      coaster({ id: 15769, park_id: 61, name: "Batman The Escape", status: "Defunct" }),
      coaster({ id: 338, park_id: 88, name: "Batman The Escape", status: "Defunct" }),
      coaster({ id: 9903, park_id: 64, name: "Firebird", status: "Defunct" }),
    ]);
    expect(coasters.map((c) => c.id).sort((a, b) => a - b)).toEqual([22, 15586, 15769]);
    expect(coasters.find((c) => c.id === 15586)).toMatchObject({
      status: "Defunct",
      opening_year: 1920,
      closing_year: 2024,
    });
  });

  it("keeps Euclid Beach's own Switchback Railway with its years there", () => {
    const fixed = applyParkScopedFixes(
      coaster({ name: "Switchback Railway (Euclid Beach Park)", status: "Defunct", opening_year: 1884 }),
      "Euclid Beach Park",
    );
    expect(fixed).toMatchObject({
      name: "Switchback Railway",
      status: "Defunct",
      opening_year: 1896,
      closing_year: 1904,
    });
  });
});

describe("Orlando catalog corrections", () => {
  const parks: Park[] = [
    { id: 177, name: "Universal Studios Florida", country: "United States", latitude: 28.47, longitude: -81.47 },
    { id: 332, name: "Epic Universe", country: "United States", latitude: 28.47, longitude: -81.44 },
  ];

  it("drops the Mario Kart dark ride and lists the Woody/Trolls credit once", () => {
    const { coasters } = normalizeCatalog(parks, [
      coaster({ id: 9846, park_id: 332, name: "Mario Kart: Bowser's Challenge", coaster_type: "Unknown" }),
      coaster({ id: 9727, park_id: 332, name: "Stardust Racers", wikidata_id: "Q124540460" }),
      coaster({ id: 522, park_id: 177, name: "Woody Woodpecker's Nuthouse Coaster", wikidata_id: "Q3569870" }),
      coaster({ id: 9797, park_id: 177, name: "Trolls Trollercoaster" }),
    ]);
    expect(coasters.map((c) => c.id).sort()).toEqual([9727, 9797]);
    expect(coasters.find((c) => c.id === 9797)).toMatchObject({ manufacturer: "Vekoma", height_ft: 28 });
  });
});
