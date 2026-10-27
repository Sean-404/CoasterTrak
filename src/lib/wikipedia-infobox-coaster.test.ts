import { describe, expect, it } from "vitest";
import {
  cleanInfoboxParkName,
  cleanInfoboxWikiValue,
  effectiveInfoboxClosingYear,
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
  it("ignores an original closing year when the ride later relaunched (The Barnstormer)", () => {
    const wt = `
{{Infobox roller coaster
|name=The Barnstormer
|location=Magic Kingdom
|opened={{Start date|1996|10|01}} (original)<br>{{Start date|2012|03|12}} (relaunch)
|closed={{End date|2011|02|12}} (original)
|status=Operating
|extend={{Infobox roller coaster/extend
|location=Disneyland Paris
|opened={{Start date|1992|04|12}}
|status=Operating
}}
}}
`;
    const [magicKingdom] = parseInfoboxCoasterLocationsFromWikitext(wt);
    expect(magicKingdom).toMatchObject({ parkName: "Magic Kingdom", status: "Operating", opening_year: 1996 });
    expect(magicKingdom?.closing_year).toBeUndefined();
  });

  it("keeps the latest closing year when nothing reopened after it", () => {
    expect(effectiveInfoboxClosingYear("1990<br>2005 (relocated)", "2001<br>2019")).toBe(2019);
    expect(effectiveInfoboxClosingYear("1996 (original)<br>2012 (relaunch)", "2011 (original)")).toBeNull();
    expect(effectiveInfoboxClosingYear(undefined, "{{End date|2008|9|1}}")).toBe(2008);
    // Same-year retheme: California Screamin' closed Jan 2018, reopened as Incredicoaster June 2018.
    expect(
      effectiveInfoboxClosingYear(
        "{{Start date|2001|2|8}} (as California Screamin')<br>{{Start date|2018|6|23}} (as Incredicoaster)",
        "{{End date|2018|1|7}} (as California Screamin')",
      ),
    ).toBeNull();
    // A ride that opened and closed in the same single season stays closed.
    expect(effectiveInfoboxClosingYear("{{Start date|2018|5|1}}", "{{End date|2018|9|1}}")).toBe(2018);
  });
});
