import { describe, expect, it } from "vitest";
import { buildCoasterEditorialIntro } from "./catalog-content";
import type { Coaster } from "@/types/domain";

function makeCoaster(partial: Partial<Coaster>): Coaster {
  return {
    id: 1,
    park_id: 1,
    name: "Example Coaster",
    coaster_type: "Steel",
    manufacturer: "Vekoma",
    status: "Operating",
    length_ft: null,
    speed_mph: 59,
    height_ft: 78,
    inversions: 0,
    duration_s: null,
    opening_year: null,
    closing_year: null,
    ...partial,
  };
}

describe("buildCoasterEditorialIntro", () => {
  it("avoids saying Unknown as the ride type", () => {
    const text = buildCoasterEditorialIntro(
      makeCoaster({ coaster_type: "Unknown", manufacturer: null }),
      "Magic Kingdom · United States",
    );
    expect(text).toContain("roller coaster at Magic Kingdom");
    expect(text).not.toMatch(/\ba Unknown\b/i);
    expect(text).toContain("78");
    expect(text).toContain("Track it on CoasterTrak");
  });
});
