import { describe, expect, it } from "vitest";
import {
  buildRcdbFieldOverridePatches,
  enrichWikidataRowsFromRcdbExport,
  normalizeRcdbExportRow,
} from "./rcdb";
import { makeRow } from "../test-helpers";

describe("normalizeRcdbExportRow", () => {
  it("normalizes ids and rounds stats", () => {
    expect(normalizeRcdbExportRow({ rcdbId: "2832", heightFt: 455.6 })).toEqual({
      rcdbId: "2832",
      lengthFt: null,
      heightFt: 456,
      speedMph: null,
      durationS: null,
      inversions: null,
      status: null,
    });
  });
});

describe("enrichWikidataRowsFromRcdbExport", () => {
  it("null-fills matched rows and reports unmatched export ids", () => {
    const rows = [
      makeRow({
        wikidataId: "Q1",
        label: "Kingda Ka",
        rcdbId: "2832",
        heightFt: null,
        speedMph: 128,
        lengthFt: null,
      }),
      makeRow({ wikidataId: "Q2", label: "Other", rcdbId: null, heightFt: null }),
    ];

    const result = enrichWikidataRowsFromRcdbExport(rows, [
      { rcdbId: "2832", heightFt: 456, lengthFt: 3118, speedMph: 999 },
      { rcdbId: "9999", heightFt: 10 },
    ]);

    expect(result.matched).toBe(1);
    expect(result.fieldsFilled).toBe(2);
    expect(result.rows[0].heightFt).toBe(456);
    expect(result.rows[0].lengthFt).toBe(3118);
    expect(result.rows[0].speedMph).toBe(128);
    expect(result.unmatchedExportIds).toEqual(["9999"]);
  });
});

describe("buildRcdbFieldOverridePatches", () => {
  it("creates override rows only for null fields", () => {
    const patches = buildRcdbFieldOverridePatches(
      42,
      "2832",
      { height_ft: null, speed_mph: 128, length_ft: null, status: "Operating" },
      {
        rcdbId: "2832",
        heightFt: 456,
        speedMph: 999,
        lengthFt: 3118,
        status: "Operating",
      },
    );
    expect(patches).toHaveLength(2);
    expect(patches.map((p) => p.field_name).sort()).toEqual(["height_ft", "length_ft"]);
    expect(patches.every((p) => p.source === "rcdb")).toBe(true);
    expect(patches[0].source_url).toBe("https://rcdb.com/2832.htm");
  });
});
