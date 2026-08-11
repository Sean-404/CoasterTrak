import { describe, expect, it } from "vitest";

import {
  deriveWikidataCoasterStats,
  normalizeWikidataBindings,
  parseWikidataTime,
  type WikidataSparqlBinding,
} from "@/lib/wikidata-coasters";

describe("parseWikidataTime", () => {
  it("parses +prefixed Wikidata timestamps", () => {
    expect(parseWikidataTime("+1990-03-17T00:00:00Z")).toBe("1990-03-17");
  });

  it("parses unprefixed ISO timestamps from WDQS", () => {
    expect(parseWikidataTime("2021-06-10T00:00:00Z")).toBe("2021-06-10");
  });

  it("parses year-only precision", () => {
    expect(parseWikidataTime("+1934-00-00T00:00:00Z")).toBe("1934-01-01");
  });

  it("returns null for empty input", () => {
    expect(parseWikidataTime(undefined)).toBeNull();
    expect(parseWikidataTime("")).toBeNull();
  });
});

describe("normalizeWikidataBindings", () => {
  it("converts bindings, merges duplicate Q-ids, and derives imperial stats", () => {
    const bindings: WikidataSparqlBinding[] = [
      {
        item: { type: "uri", value: "http://www.wikidata.org/entity/Q100324831" },
        itemLabel: { type: "literal", value: "VelociCoaster", "xml:lang": "en" },
        lengthM: {
          type: "literal",
          value: "1432.56282",
          datatype: "http://www.w3.org/2001/XMLSchema#decimal",
        },
        heightM: {
          type: "literal",
          value: "47.244093",
          datatype: "http://www.w3.org/2001/XMLSchema#decimal",
        },
        opening: {
          type: "literal",
          value: "2021-06-10T00:00:00Z",
          datatype: "http://www.w3.org/2001/XMLSchema#dateTime",
        },
      },
      {
        item: { type: "uri", value: "http://www.wikidata.org/entity/Q100324831" },
        itemLabel: { type: "literal", value: "VelociCoaster", "xml:lang": "en" },
        speedMs: {
          type: "literal",
          value: "31.2928",
          datatype: "http://www.w3.org/2001/XMLSchema#decimal",
        },
      },
    ];

    const rows = normalizeWikidataBindings(bindings);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.wikidataId).toBe("Q100324831");
    expect(rows[0]!.openingDate).toBe("2021-06-10");
    expect(rows[0]!.status).toBe("operating");
    expect(rows[0]!.lengthM).toBeCloseTo(1432.56282);
    expect(rows[0]!.speedMs).toBeCloseTo(31.2928);
    expect(rows[0]!.heightFt).toBeCloseTo(155, 0);
    expect(rows[0]!.speedMph).toBeCloseTo(70, 0);
  });
});

describe("deriveWikidataCoasterStats", () => {
  it("fills imperial fields from metric when missing", () => {
    const row = deriveWikidataCoasterStats({
      wikidataId: "Q1",
      label: "Test",
      latitude: null,
      longitude: null,
      countryLabel: null,
      parkLabel: null,
      parkWikidataId: null,
      manufacturerLabel: null,
      lengthM: 304.8,
      speedMs: 20,
      heightM: 30.48,
      durationS: null,
      openingDate: null,
      retirementDate: null,
      demolishedDate: null,
      rcdbId: null,
      enwikiTitle: null,
      imageUrl: null,
      status: "unknown",
      speedMph: null,
      lengthFt: null,
      heightFt: null,
      coasterTypeLabel: null,
      inversions: null,
    });

    expect(row.lengthFt).toBeCloseTo(1000, 0);
    expect(row.heightFt).toBeCloseTo(100, 0);
    expect(row.speedMph).toBeCloseTo(44.7, 0);
  });
});
