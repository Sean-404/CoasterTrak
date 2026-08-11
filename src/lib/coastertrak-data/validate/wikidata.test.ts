import { describe, expect, it } from "vitest";

import { validateWikidataSnapshot } from "@/lib/coastertrak-data/validate/wikidata";
import { makeRow } from "@/lib/coastertrak-data/test-helpers";

describe("validateWikidataSnapshot", () => {
  it("passes a clean snapshot", () => {
    const { report, passed } = validateWikidataSnapshot({
      rows: [
        makeRow({
          wikidataId: "Q100324831",
          label: "VelociCoaster",
          status: "operating",
          openingDate: "2021-06-10",
          heightFt: 155,
          lengthFt: 4700,
        }),
      ],
      sourcePath: "test.json",
      meta: { sourceQueryMode: "full", usedLiteFallback: false },
    });

    expect(passed).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  it("errors on duplicate Wikidata ids", () => {
    const { report, passed } = validateWikidataSnapshot({
      rows: [
        makeRow({ wikidataId: "Q1", label: "A" }),
        makeRow({ wikidataId: "Q1", label: "A copy" }),
      ],
      sourcePath: "test.json",
    });

    expect(passed).toBe(false);
    expect(report.findings.some((f) => f.code === "duplicate_wikidata_id")).toBe(true);
  });

  it("errors on lite SPARQL fallback unless allowed", () => {
    const blocked = validateWikidataSnapshot({
      rows: [makeRow({ wikidataId: "Q1", label: "A" })],
      sourcePath: "test.json",
      meta: { usedLiteFallback: true, sourceQueryMode: "lite" },
    });
    expect(blocked.passed).toBe(false);
    expect(blocked.report.findings.some((f) => f.code === "lite_sparql_fallback")).toBe(true);

    const allowed = validateWikidataSnapshot({
      rows: [makeRow({ wikidataId: "Q1", label: "A" })],
      sourcePath: "test.json",
      meta: { usedLiteFallback: true, sourceQueryMode: "lite" },
      allowLiteMeta: true,
    });
    expect(allowed.passed).toBe(true);
  });

  it("errors when row count is below minimum", () => {
    const { passed, report } = validateWikidataSnapshot({
      rows: [makeRow({ wikidataId: "Q1", label: "A" })],
      sourcePath: "test.json",
      minRows: 50,
    });
    expect(passed).toBe(false);
    expect(report.findings.some((f) => f.code === "row_count_below_minimum")).toBe(true);
  });

  it("warns on suspicious height outliers", () => {
    const { report, passed } = validateWikidataSnapshot({
      rows: [
        makeRow({
          wikidataId: "Q1",
          label: "Too Tall",
          heightFt: 900,
        }),
      ],
      sourcePath: "test.json",
    });
    expect(passed).toBe(true);
    expect(report.findings.some((f) => f.code === "stat_outlier_height")).toBe(true);
  });
});
