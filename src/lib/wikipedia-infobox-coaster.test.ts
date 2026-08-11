import { describe, expect, it } from "vitest";
import {
  cleanInfoboxWikiValue,
  extractInfoboxRollerCoasterBlock,
  parseInfoboxCoasterStatsFromWikitext,
} from "./wikipedia-infobox-coaster";

describe("wikipedia-infobox-coaster", () => {
  it("parses a standard roller coaster infobox", () => {
    const wt = `
{{Infobox roller coaster
| name = Example Coaster
| type = Steel
| manufacturer = [[Vekoma]]
| height_ft = 78.1
| length_ft = 3169.3
| speed_mph = 59.3
| inversions = 0
| duration = 1:00
}}
`;
    expect(parseInfoboxCoasterStatsFromWikitext(wt)).toEqual({
      length_ft: 3169,
      height_ft: 78,
      speed_mph: 59,
      inversions: 0,
      duration_s: 60,
      manufacturer: "Vekoma",
      coaster_type: "Steel",
    });
  });

  it("parses dual roller coaster track-1 fields", () => {
    const wt = `
{{Infobox dual roller coaster
| name = Stardust Racers
| type = Steel
| manufacturer = Mack Rides
| height1_ft = 133
| length1_ft = 5000
| speed1_mph = 62
| inversions1 = 1
}}
`;
    expect(extractInfoboxRollerCoasterBlock(wt)).toContain("dual roller coaster");
    expect(parseInfoboxCoasterStatsFromWikitext(wt)).toEqual({
      length_ft: 5000,
      height_ft: 133,
      speed_mph: 62,
      inversions: 1,
      manufacturer: "Mack Rides",
      coaster_type: "Steel",
    });
  });

  it("cleans wiki links and br separators in manufacturer cells", () => {
    expect(cleanInfoboxWikiValue("[[Mack Rides|Mack]]<br>[[Vekoma]]")).toBe("Mack · Vekoma");
  });
});
