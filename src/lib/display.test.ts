import { describe, expect, it } from "vitest";
import {
  formatManufacturerLabel,
  matchesSearchQuery,
  normalizeManufacturerLabel,
} from "./display";

describe("matchesSearchQuery", () => {
  it("matches names without umlauts to stored German spellings", () => {
    expect(matchesSearchQuery("Nürburgring", "nurburgring")).toBe(true);
    expect(matchesSearchQuery("Gröna Lund", "grona lund")).toBe(true);
  });

  it("still ignores apostrophes and punctuation", () => {
    expect(matchesSearchQuery("Falcons Flight", "Falcon's Flight")).toBe(true);
  });
});

describe("normalizeManufacturerLabel", () => {
  it("inserts separators when Wikipedia drops <br> between makers", () => {
    expect(
      normalizeManufacturerLabel(
        "Arrow Development (California and Florida)Dynamic Structures (2014 California rebuild)Vekoma (Paris, Tokyo)",
      ),
    ).toBe(
      "Arrow Development (California and Florida) · Dynamic Structures (2014 California rebuild) · Vekoma (Paris, Tokyo)",
    );
  });

  it("strips leftover wiki brackets", () => {
    expect(
      normalizeManufacturerLabel("Arrow Development (1977–2003)Dynamic Structures (2005–present)]]"),
    ).toBe("Arrow Development (1977–2003) · Dynamic Structures (2005–present)");
  });

  it("collapses duplicated brands from wikitable manufacturer cells", () => {
    expect(
      normalizeManufacturerLabel(
        "Vekoma Vekoma (Orlando, Japan) · Mack Rides Mack Rides (Hollywood, Beijing)",
      ),
    ).toBe("Vekoma (Orlando, Japan) · Mack Rides (Hollywood, Beijing)");
  });

  it("handles wiki pipe-escape table cells", () => {
    expect(
      normalizeManufacturerLabel(
        "Vekoma{{!}}Vekoma (Orlando, Japan) · Mack Rides{{!}}Mack Rides (Hollywood, Beijing)",
      ),
    ).toBe("Vekoma (Orlando, Japan) · Mack Rides (Hollywood, Beijing)");
  });

  it("returns null for empty input", () => {
    expect(normalizeManufacturerLabel(null)).toBeNull();
    expect(normalizeManufacturerLabel("   ")).toBeNull();
  });
});

describe("formatManufacturerLabel", () => {
  const hippogriff =
    "Vekoma Vekoma (Orlando, Japan) · Mack Rides Mack Rides (Hollywood, Beijing)";

  it("picks the install matching the current park", () => {
    expect(
      formatManufacturerLabel(hippogriff, {
        parkName: "Universal's Islands of Adventure",
        country: "United States",
      }),
    ).toBe("Vekoma");
    expect(
      formatManufacturerLabel(hippogriff, {
        parkName: "Universal Studios Hollywood",
        country: "United States",
      }),
    ).toBe("Mack Rides");
  });

  it("falls back to unique brands without location notes", () => {
    expect(formatManufacturerLabel(hippogriff)).toBe("Vekoma · Mack Rides");
  });
});
