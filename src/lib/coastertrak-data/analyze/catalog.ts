import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ThemeParksMatchReport } from "@/lib/data-platform/themeparks-match";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

import { analyzeDedupeAndConflicts } from "../analyze/dedupe-conflicts";
import { wikidataReportDir } from "../paths";
import type { CatalogAnalysisReport, DedupeAnalysisReport } from "../types";
import { verifySnapshotAgainstThemeParks } from "../verify/themeparks-snapshot";
import { renderCatalogAnalysisMarkdown } from "./report-markdown";

export type AnalyzeCatalogOptions = {
  rows: WikidataCoasterRow[];
  sourcePath: string;
  reportRunId: string;
  dataRoot?: string;
  skipThemeParks?: boolean;
  maxParks?: number;
  delayMs?: number;
  failOnDuplicates?: boolean;
  onProgress?: (message: string) => void;
};

export async function analyzeCatalogSnapshot(
  options: AnalyzeCatalogOptions,
): Promise<CatalogAnalysisReport & { reportDir: string; passed: boolean }> {
  const log = options.onProgress ?? (() => {});
  log("Analyzing dedupe and conflicts…");
  const dedupe = analyzeDedupeAndConflicts(options.rows);

  let themeparks: ThemeParksMatchReport | null = null;
  if (!options.skipThemeParks) {
    themeparks = await verifySnapshotAgainstThemeParks({
      rows: options.rows,
      maxParks: options.maxParks,
      delayMs: options.delayMs,
      onProgress: log,
    });
  }

  const hasHardDuplicate =
    options.failOnDuplicates &&
    dedupe.findings.some(
      (f) => f.code === "duplicate_name_same_park" && f.severity === "error",
    );

  const passed = dedupe.summary.errors === 0 && !hasHardDuplicate;

  const report: CatalogAnalysisReport = {
    generatedAt: new Date().toISOString(),
    sourceRunId: options.reportRunId,
    sourcePath: options.sourcePath,
    dedupe,
    themeparks,
    passed,
  };

  const reportDir = wikidataReportDir(options.reportRunId, options.dataRoot);
  await mkdir(reportDir, { recursive: true });

  await writeFile(
    join(reportDir, "catalog-analysis.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  await writeFile(
    join(reportDir, "dedupe-report.json"),
    JSON.stringify(dedupe, null, 2),
    "utf8",
  );
  if (themeparks) {
    await writeFile(
      join(reportDir, "themeparks-snapshot-report.json"),
      JSON.stringify(themeparks, null, 2),
      "utf8",
    );
  }
  await writeFile(
    join(reportDir, "catalog-analysis.md"),
    renderCatalogAnalysisMarkdown(report),
    "utf8",
  );

  log(
    `Catalog analysis → ${reportDir} (${dedupe.summary.errors} dedupe errors, ${dedupe.summary.warnings} warnings)`,
  );

  return { ...report, reportDir, passed };
}

export type { DedupeAnalysisReport };
