import { describe, expect, it } from "vitest";

import { analyzeDedupeAndConflicts } from "@/lib/coastertrak-data/analyze/dedupe-conflicts";
import { makeRow } from "@/lib/coastertrak-data/test-helpers";

describe("analyzeDedupeAndConflicts", () => {
  it("flags different Q-ids sharing park+name", () => {
    const report = analyzeDedupeAndConflicts([
      makeRow({
        wikidataId: "Q1",
        label: "Blue Flyer",
        parkLabel: "Blackpool Pleasure Beach",
        parkWikidataId: "Q880813",
        status: "operating",
      }),
      makeRow({
        wikidataId: "Q2",
        label: "Blue Flyer",
        parkLabel: "Blackpool Pleasure Beach",
        parkWikidataId: "Q880813",
        status: "defunct",
      }),
    ]);

    expect(report.summary.duplicateGroups).toBe(1);
    expect(report.summary.errors).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.code === "duplicate_name_same_park")).toBe(true);
    expect(report.findings.some((f) => f.code === "conflicting_status")).toBe(true);
  });

  it("flags conflicting height stats in a duplicate group", () => {
    const report = analyzeDedupeAndConflicts([
      makeRow({
        wikidataId: "Q10",
        label: "Same Ride",
        parkLabel: "Test Park",
        parkWikidataId: "Q999",
        heightFt: 100,
      }),
      makeRow({
        wikidataId: "Q11",
        label: "Same Ride",
        parkLabel: "Test Park",
        parkWikidataId: "Q999",
        heightFt: 200,
      }),
    ]);

    expect(report.findings.some((f) => f.code === "conflicting_stats")).toBe(true);
  });

  it("flags placeholder Q-id labels", () => {
    const report = analyzeDedupeAndConflicts([
      makeRow({
        wikidataId: "Q137830653",
        label: "Q137830653",
        parkLabel: "Somewhere",
      }),
    ]);

    expect(report.findings.some((f) => f.code === "placeholder_label")).toBe(true);
  });

  it("flags proximate similar names within a park", () => {
    const report = analyzeDedupeAndConflicts([
      makeRow({
        wikidataId: "Q20",
        label: "California Screamin",
        parkLabel: "Disney California Adventure",
        parkWikidataId: "Q148",
        latitude: 33.8047,
        longitude: -117.9209,
      }),
      makeRow({
        wikidataId: "Q21",
        label: "California Screaming",
        parkLabel: "Disney California Adventure",
        parkWikidataId: "Q148",
        latitude: 33.8048,
        longitude: -117.9210,
      }),
    ]);

    expect(report.summary.proximatePairs).toBeGreaterThanOrEqual(1);
    expect(report.findings.some((f) => f.code === "proximate_similar_name")).toBe(true);
  });
});
