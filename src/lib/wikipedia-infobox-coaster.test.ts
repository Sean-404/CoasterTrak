import { describe, expect, it } from "vitest";
import {
  cleanInfoboxParkName,
  cleanInfoboxWikiValue,
  extractInfoboxRollerCoasterBlock,
  isCountryOnlyInfoboxLocation,
  parseInfoboxCoasterLocationsFromWikitext,
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

  it("parses opening year from opened / Start date templates", () => {
    const wt = `
{{Infobox roller coaster
| name = Nemesis
| manufacturer = [[Bolliger & Mabillard]]
| opened = {{Start date|1994|3|19|df=y}}
| height = {{convert|13|m|ft|0|abbr=on}}
}}
`;
    expect(parseInfoboxCoasterStatsFromWikitext(wt)).toMatchObject({
      opening_year: 1994,
      manufacturer: "Bolliger & Mabillard",
      height_ft: 43,
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

  it("reads Ride of Steel's Darien Lake extend location as operating", () => {
    const wt = `
{{Infobox roller coaster
|name=Ride of Steel
|location=Six Flags America
|opened={{Start date|2000|05|13}}
|status=Closed
|closed={{Start date|2025|11|02}}
|rcdb_number=699
|extend={{Infobox roller coaster/extend
|location=Six Flags Darien Lake
|opened={{Start date|1999|05|15}}
|status=Operating
|rcdb_number=541
}}
}}
`;
    expect(parseInfoboxCoasterLocationsFromWikitext(wt)).toEqual([
      {
        name: "Ride of Steel",
        parkName: "Six Flags America",
        status: "Defunct",
        opening_year: 2000,
        closing_year: 2025,
        rcdb_id: "699",
      },
      {
        parkName: "Six Flags Darien Lake",
        status: "Operating",
        opening_year: 1999,
        rcdb_id: "541",
      },
    ]);
  });

  it("reads Superman Ultimate Flight slashless extend parks", () => {
    const wt = `
{{Infobox roller coaster
| location = Six Flags Over Georgia
| status = Operating
| opened = April 6, 2002
| extend = {{Infobox roller coaster extend
| location = Six Flags Great Adventure
| status = Operating
| opened = April 17, 2003
| rcdb_number = 1976
}}{{Infobox roller coaster extend
| location = Six Flags Great America
| status = Operating
| opened = May 3, 2003
| rcdb_number = 1977
}}
}}
`;
    expect(parseInfoboxCoasterLocationsFromWikitext(wt).map((l) => `${l.parkName}:${l.status}:${l.opening_year}`)).toEqual([
      "Six Flags Over Georgia:Operating:2002",
      "Six Flags Great Adventure:Operating:2003",
      "Six Flags Great America:Operating:2003",
    ]);
  });

  it("cleans leftover wikilink junk and skips country-only locations", () => {
    expect(cleanInfoboxParkName("[[Wonderland Park (Texas)")).toBe("Wonderland Park (Texas)");
    expect(cleanInfoboxParkName("Geauga Lake (amusement park)|Geauga Lake")).toBe("Geauga Lake");
    expect(isCountryOnlyInfoboxLocation("Germany")).toBe(true);
    expect(isCountryOnlyInfoboxLocation("Six Flags America")).toBe(false);
  });
});
