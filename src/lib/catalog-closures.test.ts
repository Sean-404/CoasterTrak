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
