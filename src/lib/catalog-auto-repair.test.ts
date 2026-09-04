import { describe, expect, it } from "vitest";

import { detectSwappedHeightLength } from "@/lib/catalog-auto-repair";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";

describe("detectSwappedHeightLength", () => {
  it("detects Orkanen-style swaps", () => {
    expect(detectSwappedHeightLength(1486, 63)).toEqual({ height_ft: 63, length_ft: 1486 });
  });

  it("detects Lynet-style swaps", () => {
    expect(detectSwappedHeightLength(1772, 66)).toEqual({ height_ft: 66, length_ft: 1772 });
  });

  it("ignores plausible pairs", () => {
    expect(detectSwappedHeightLength(200, 3000)).toBeNull();
    expect(detectSwappedHeightLength(63, 1486)).toBeNull();
  });
});

describe("relocated closing year fixes", () => {
  it("clears Matugani prior-life closing year via known fix", () => {
    const fixed = applyCoasterKnownFixes({
      name: "Matugani",
      wikidata_id: "Q134966734",
      opening_year: 2023,
      closing_year: 2016,
      status: "Operating",
    });
    expect(fixed.closing_year).toBeNull();
    expect(fixed.status).toBe("Operating");
  });

  it("sets Knightmare Camelot closing year via known fix", () => {
    const fixed = applyCoasterKnownFixes({
      name: "Knightmare",
      wikidata_id: "Q13415786",
      opening_year: 2007,
      closing_year: 2006,
      status: "Defunct",
    });
    expect(fixed.closing_year).toBe(2012);
  });
});