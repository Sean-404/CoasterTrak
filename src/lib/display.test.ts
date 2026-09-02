import { describe, expect, it } from "vitest";
import { matchesSearchQuery, normalizeManufacturerLabel } from "./display";

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

  it("returns null for empty input", () => {
    expect(normalizeManufacturerLabel(null)).toBeNull();
    expect(normalizeManufacturerLabel("   ")).toBeNull();
  });
});
