import { describe, expect, it } from "vitest";
import type { Coaster, Park } from "@/types/domain";
import { applyParkScopedFixes, FORMER_INSTALL_FIXES, MISATTRIBUTED_ROWS } from "@/lib/catalog-closures";
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
      coaster({ id: 12, park_id: 17, name: "Roar (roller coaster)", opening_year: 1998 }),
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

  it("keeps Euclid Beach's own Switchback Railway without Coney Island's details", () => {
    const fixed = applyParkScopedFixes(
      coaster({
        name: "Switchback Railway (Euclid Beach Park)",
        status: "Defunct",
        opening_year: 1884,
        height_ft: 50,
        enwiki_title: "Switchback Railway",
        summary_text: "The original Switchback Railway was the first roller coaster at Coney Island…",
      }),
      "Euclid Beach Park",
    );
    expect(fixed).toMatchObject({
      name: "Switchback Railway",
      status: "Defunct",
      opening_year: 1896,
      closing_year: 1904,
      height_ft: null,
      enwiki_title: null,
      summary_text: null,
    });
  });

  it("turns Knoebels' Flying Turns at Euclid Beach into the park's own 1930 ride", () => {
    for (const name of ["Flying Turns (Euclid Beach Park)", "Flying Turns"]) {
      const fixed = applyParkScopedFixes(
        coaster({ name, wikidata_id: "Q1434625", opening_year: 2013, manufacturer: "Knoebels Amusement Resort" }),
        "Euclid Beach Park",
      );
      expect(fixed).toMatchObject({
        name: "Flying Turns",
        status: "Defunct",
        opening_year: 1930,
        closing_year: 1969,
        manufacturer: "John Norman Bartlett",
        wikidata_id: null,
      });
    }
  });

  it("names Batman The Escape and Iron Wolf as they ran at their earlier parks", () => {
    expect(applyParkScopedFixes(coaster({ name: "Batman The Escape" }), "Six Flags Magic Mountain")).toMatchObject({
      name: "Shockwave",
      opening_year: 1986,
      closing_year: 1988,
    });
    expect(applyParkScopedFixes(coaster({ name: "Batman The Escape" }), "Six Flags Great Adventure")).toMatchObject({
      name: "Shockwave",
      opening_year: 1990,
      closing_year: 1992,
    });
    expect(
      applyParkScopedFixes(coaster({ name: "Firebird (roller coaster)" }), "Six Flags Great America"),
    ).toMatchObject({ name: "Iron Wolf", status: "Defunct", opening_year: 1990, closing_year: 2011 });
  });

  it("shows Six Flags St. Louis as Mid America Adventure with plain ride names", () => {
    const parks: Park[] = [
      { id: 65, name: "Six Flags St. Louis", country: "United States", latitude: 38.51, longitude: -90.68 },
    ];
    const { parks: out, coasters } = normalizeCatalog(parks, [
      coaster({ id: 286, park_id: 65, name: "Ninja (Mid America Adventure)", wikidata_id: "Q1432350" }),
    ]);
    expect(out[0]?.name).toBe("Mid America Adventure");
    expect(coasters[0]?.name).toBe("Ninja");
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

describe("Wikipedia /extend installs", () => {
  const parks: Park[] = [
    { id: 17, name: "Six Flags America", country: "United States", latitude: 38.9, longitude: -76.77 },
    { id: 178, name: "Six Flags Mexico", country: "Mexico", latitude: 19.3, longitude: -99.21 },
    { id: 78, name: "Disneyland", country: "United States", latitude: 33.81, longitude: -117.92 },
    { id: 195, name: "Lagoon", country: "United States", latitude: 40.98, longitude: -111.9 },
    { id: 69, name: "Worlds of Fun", country: "United States", latitude: 39.17, longitude: -94.49 },
  ];

  it("hides rows whose infobox park matched the wrong catalog park", () => {
    const { coasters } = normalizeCatalog(parks, [
      coaster({ id: 216, park_id: 178, name: "Batgirl Batarang", wikidata_id: "Q4943492" }),
      coaster({ id: 15768, park_id: 17, name: "Batgirl Batarang" }),
      coaster({ id: 15805, park_id: 17, name: "Green Lantern (Six Flags Great Adventure)", status: "Defunct" }),
      coaster({ id: 15842, park_id: 78, name: "Seven Dwarfs Mine Train" }),
      coaster({ id: 15761, park_id: 195, name: "All American Triple Loop", status: "Defunct" }),
    ]);
    expect(coasters.map((c) => c.id)).toEqual([216]);
  });

  it("turns Worlds of Fun's Batgirl Batarang row into the park's own Boomerang", () => {
    const { coasters } = normalizeCatalog(parks, [
      coaster({
        id: 524,
        park_id: 69,
        name: "Batgirl Batarang",
        status: "Unknown",
        opening_year: 1988,
        height_ft: 117,
        image_url: "https://commons.wikimedia.org/wiki/Special:FilePath/Boomerang%20%28Six%20Flags%20M%C3%A9xico%29.jpg",
      }),
    ]);
    expect(coasters[0]).toMatchObject({
      name: "Boomerang",
      status: "Operating",
      opening_year: 2000,
      closing_year: null,
      height_ft: null,
      image_url: null,
    });
  });

  it("names former installs as they ran at that park", () => {
    expect(applyParkScopedFixes(coaster({ name: "Cosmic Coaster (Valleyfair)" }), "Dorney Park")).toMatchObject({
      name: "Dragon Coaster",
      status: "Defunct",
      opening_year: 1992,
      closing_year: 2010,
    });
    expect(applyParkScopedFixes(coaster({ name: "Alpine Bobsled", status: "Defunct" }), "Six Flags Great America")).toMatchObject({
      name: "Rolling Thunder",
      opening_year: 1989,
      closing_year: 1995,
    });
    expect(
      applyParkScopedFixes(coaster({ name: "Nightmare at Crack Axle Canyon", opening_year: 2006 }), "Beech Bend Park"),
    ).toMatchObject({ name: "Jet Star", status: "Defunct", opening_year: null, closing_year: 1984 });
  });

  it("matches renamed Wikidata rows under both names, since the sync writes the name back", () => {
    for (const name of ["Thunderbolt Express", "Demon"]) {
      expect(applyParkScopedFixes(coaster({ name, opening_year: 1988 }), "Kings Island")).toMatchObject({
        name: "Demon",
        status: "Defunct",
        opening_year: 1977,
        closing_year: 1987,
      });
    }
  });

  it("restores Magic Mountain's own Goliath after /extend gave it Déjà Vu's years", () => {
    const fixed = applyParkScopedFixes(
      coaster({
        name: "Goliath",
        wikidata_id: "Q510289",
        status: "Defunct",
        opening_year: 2001,
        closing_year: 2011,
        manufacturer: "Rocky Mountain Construction",
        enwiki_title: "Goliath (Six Flags New England)",
        summary_text: "Goliath was a steel shuttle roller coaster…",
      }),
      "Six Flags Magic Mountain",
    );
    expect(fixed).toMatchObject({
      status: "Operating",
      opening_year: 2000,
      closing_year: null,
      manufacturer: "Giovanola",
      enwiki_title: "Goliath (Six Flags Magic Mountain)",
      summary_text: null,
    });
  });

  it("cites a source URL for every correction", () => {
    const sources = [
      ...Object.values(FORMER_INSTALL_FIXES).flatMap((byName) => Object.values(byName).map((f) => f.source)),
      ...Object.values(MISATTRIBUTED_ROWS).flatMap((byName) => Object.values(byName)),
    ];
    for (const source of sources) expect(source).toMatch(/^https:\/\/\S+$/);
  });
});

describe("non-coaster rows", () => {
  it("hides flat rides and shows but keeps the park's coasters", () => {
    const parks: Park[] = [
      { id: 69, name: "Worlds of Fun", country: "United States", latitude: 39.17, longitude: -94.49 },
      { id: 244, name: "Hong Kong Disneyland", country: "China", latitude: 22.31, longitude: 114.04 },
      { id: 85, name: "La Ronde", country: "Canada", latitude: 45.52, longitude: -73.53 },
    ];
    const { coasters } = normalizeCatalog(parks, [
      coaster({ id: 4919, park_id: 69, name: "Linus' Launcher" }),
      coaster({ id: 4929, park_id: 69, name: "Woodstock Whirlybirds" }),
      coaster({ id: 50, park_id: 69, name: "Mamba" }),
      coaster({ id: 10506, park_id: 244, name: "Playhouse in the Woods" }),
      coaster({ id: 10552, park_id: 244, name: "Wandering Oaken’s Sliding Sleighs", wikidata_id: "Q124377115" }),
      coaster({ id: 9594, park_id: 85, name: "Vertigo (roller coaster)", wikidata_id: "Q1609030" }),
      coaster({ id: 9371, park_id: 85, name: "Boomerang", wikidata_id: "Q3220536", status: "Unknown" }),
    ]);
    expect(coasters.map((c) => c.id).sort((a, b) => a - b)).toEqual([50, 9371, 10552]);
    expect(coasters.find((c) => c.id === 9371)).toMatchObject({ status: "Operating", opening_year: 1984 });
  });
});
