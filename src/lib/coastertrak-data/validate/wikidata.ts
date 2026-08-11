import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

import { wikidataReportDir } from "../paths";
import type {
  ProcessedNormalizeMeta,
  QualityFinding,
  QualityReport,
  QualityValidateResult,
} from "../types";
import { renderQualityReportMarkdown } from "./report-markdown";

const INCIDENT_TITLE_RE =
  /\b(disaster|accident|incident|derailment|collision|crash|fire|explosion|fatal)\b/i;
const INCIDENT_TITLE_QID_ALLOWLIST = new Set(["Q22000267"]);

/** Conservative upper bounds — findings are warnings for manual review, not auto-rejects. */
const STAT_LIMITS = {
  heightFt: 520,
  speedMph: 160,
  lengthFt: 9000,
  inversions: 14,
} as const;

type SnapshotMeta = {
  sourceRunId?: string;
  sourceQueryMode?: string;
  usedLiteFallback?: boolean | null;
  sourceUsedLiteFallback?: boolean;
  rowCount?: number;
};

export type ValidateWikidataSnapshotOptions = {
  rows: WikidataCoasterRow[];
  sourcePath: string;
  meta?: SnapshotMeta | null;
  metaPath?: string | null;
  reportRunId?: string;
  dataRoot?: string;
  strictIncidents?: boolean;
  allowLiteMeta?: boolean;
  /** Fail when any warning-level finding is present (for CI). */
  failOnWarnings?: boolean;
  /** Minimum row count — error if snapshot is suspiciously small. */
  minRows?: number;
  onProgress?: (message: string) => void;
};

function isMissingAllQuantities(row: WikidataCoasterRow): boolean {
  return (
    row.lengthM == null &&
    row.speedMs == null &&
    row.heightM == null &&
    row.durationS == null
  );
}

function usedLiteFallback(meta: SnapshotMeta | null | undefined): boolean {
  if (!meta) return false;
  if (meta.usedLiteFallback === true) return true;
  return meta.sourceUsedLiteFallback === true;
}

function queryMode(meta: SnapshotMeta | null | undefined): string | null {
  return meta?.sourceQueryMode ?? null;
}

export function validateWikidataSnapshot(
  options: ValidateWikidataSnapshotOptions,
): Omit<QualityValidateResult, "reportDir"> & { report: QualityReport } {
  const rows = options.rows;
  const findings: QualityFinding[] = [];
  const meta = options.meta ?? null;

  const byQid = new Map<string, WikidataCoasterRow[]>();
  for (const row of rows) {
    const qid = row.wikidataId.trim().toUpperCase();
    if (!/^Q\d+$/.test(qid)) {
      findings.push({
        severity: "error",
        code: "invalid_wikidata_id",
        message: `Invalid Wikidata id format: ${row.wikidataId}`,
        wikidataId: row.wikidataId,
        label: row.label,
      });
      continue;
    }
    const arr = byQid.get(qid) ?? [];
    arr.push(row);
    byQid.set(qid, arr);
  }

  for (const [qid, items] of byQid) {
    if (items.length <= 1) continue;
    findings.push({
      severity: "error",
      code: "duplicate_wikidata_id",
      message: `${items.length} rows share the same Wikidata id`,
      wikidataId: qid,
      label: items.map((r) => r.label).join(" / "),
      details: {
        labels: [...new Set(items.map((r) => r.label))],
        enwikiTitles: [...new Set(items.map((r) => r.enwikiTitle ?? "").filter(Boolean))],
      },
    });
  }

  if (options.minRows != null && rows.length < options.minRows) {
    findings.push({
      severity: "error",
      code: "row_count_below_minimum",
      message: `Snapshot has ${rows.length} rows (minimum ${options.minRows})`,
    });
  }

  if (usedLiteFallback(meta) && !options.allowLiteMeta) {
    findings.push({
      severity: "error",
      code: "lite_sparql_fallback",
      message:
        "Lite SPARQL fallback was used; stats and park linkage may be incomplete. Re-fetch when WDQS is healthy.",
    });
  } else if (usedLiteFallback(meta)) {
    findings.push({
      severity: "warning",
      code: "lite_sparql_fallback",
      message: "Lite SPARQL fallback was used (--allow-lite-meta override active).",
    });
  }

  const mode = queryMode(meta);
  if (mode === "core" || mode === "lite") {
    findings.push({
      severity: "warning",
      code: "degraded_query_mode",
      message: `Ingest used ${mode} SPARQL query; park-parent resolution may be reduced vs full query.`,
    });
  }

  let rowsMissingAllQuantities = 0;
  let rowsMissingPark = 0;
  let rowsMissingCoords = 0;
  let rowsMissingOpeningDate = 0;
  const statusCounts: Record<string, number> = {};

  for (const row of rows) {
    const qid = row.wikidataId.trim().toUpperCase();
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;

    if (!row.label?.trim()) {
      findings.push({
        severity: "error",
        code: "missing_label",
        message: "Row has no label",
        wikidataId: qid,
      });
    }

    if (isMissingAllQuantities(row)) rowsMissingAllQuantities += 1;
    if (!row.parkLabel && !row.parkWikidataId) rowsMissingPark += 1;
    if (row.latitude == null || row.longitude == null) rowsMissingCoords += 1;
    if (!row.openingDate) rowsMissingOpeningDate += 1;

    const title = (row.enwikiTitle ?? "").trim();
    if (
      title &&
      INCIDENT_TITLE_RE.test(title) &&
      !INCIDENT_TITLE_QID_ALLOWLIST.has(qid) &&
      !INCIDENT_TITLE_RE.test(row.label)
    ) {
      findings.push({
        severity: options.strictIncidents ? "error" : "warning",
        code: "suspicious_incident_enwiki_title",
        message: `English Wikipedia title looks incident-related: ${title}`,
        wikidataId: qid,
        label: row.label,
        details: { enwikiTitle: title },
      });
    }

    if (
      row.latitude != null &&
      row.longitude != null &&
      !row.parkLabel &&
      !row.parkWikidataId
    ) {
      findings.push({
        severity: "info",
        code: "coords_without_park",
        message: "Has coordinates but no linked park",
        wikidataId: qid,
        label: row.label,
      });
    }

    if (row.heightFt != null && row.heightFt > STAT_LIMITS.heightFt) {
      findings.push({
        severity: "warning",
        code: "stat_outlier_height",
        message: `Height ${Math.round(row.heightFt)} ft exceeds ${STAT_LIMITS.heightFt} ft`,
        wikidataId: qid,
        label: row.label,
        details: { heightFt: row.heightFt },
      });
    }
    if (row.speedMph != null && row.speedMph > STAT_LIMITS.speedMph) {
      findings.push({
        severity: "warning",
        code: "stat_outlier_speed",
        message: `Speed ${Math.round(row.speedMph)} mph exceeds ${STAT_LIMITS.speedMph} mph`,
        wikidataId: qid,
        label: row.label,
        details: { speedMph: row.speedMph },
      });
    }
    if (row.lengthFt != null && row.lengthFt > STAT_LIMITS.lengthFt) {
      findings.push({
        severity: "warning",
        code: "stat_outlier_length",
        message: `Length ${Math.round(row.lengthFt)} ft exceeds ${STAT_LIMITS.lengthFt} ft`,
        wikidataId: qid,
        label: row.label,
        details: { lengthFt: row.lengthFt },
      });
    }
    if (row.inversions != null && row.inversions > STAT_LIMITS.inversions) {
      findings.push({
        severity: "warning",
        code: "stat_outlier_inversions",
        message: `Inversions ${row.inversions} exceeds ${STAT_LIMITS.inversions}`,
        wikidataId: qid,
        label: row.label,
        details: { inversions: row.inversions },
      });
    }
  }

  const missingStatsPct =
    rows.length > 0 ? rowsMissingAllQuantities / rows.length : 0;
  if (rows.length > 0 && missingStatsPct > 0.9) {
    findings.push({
      severity: "warning",
      code: "sparse_stats_coverage",
      message: `${Math.round(missingStatsPct * 100)}% of rows missing all quantity fields`,
      details: { rowsMissingAllQuantities, totalRows: rows.length },
    });
  }

  const missingParkPct = rows.length > 0 ? rowsMissingPark / rows.length : 0;
  if (rows.length > 100 && missingParkPct > 0.85 && mode !== "full") {
    findings.push({
      severity: "warning",
      code: "sparse_park_linkage",
      message: `${Math.round(missingParkPct * 100)}% of rows have no park link`,
      details: { rowsMissingPark, totalRows: rows.length },
    });
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;

  const report: QualityReport = {
    generatedAt: new Date().toISOString(),
    sourcePath: options.sourcePath,
    metaPath: options.metaPath ?? null,
    totalRows: rows.length,
    summary: {
      errors,
      warnings,
      info,
      rowsMissingAllQuantities,
      rowsMissingPark,
      rowsMissingCoords,
      rowsMissingOpeningDate,
      statusCounts,
      sourceQueryMode: mode,
      usedLiteFallback: meta
        ? usedLiteFallback(meta)
          ? true
          : meta.usedLiteFallback === false || meta.sourceUsedLiteFallback === false
            ? false
            : null
        : null,
    },
    findings,
  };

  const passed =
    errors === 0 && !(options.failOnWarnings && warnings > 0);

  return { report, passed };
}

export async function validateAndWriteWikidataReport(
  options: ValidateWikidataSnapshotOptions,
): Promise<QualityValidateResult> {
  const log = options.onProgress ?? (() => {});
  const { report, passed } = validateWikidataSnapshot(options);

  const runId =
    options.reportRunId ??
    options.meta?.sourceRunId ??
    report.generatedAt.replace(/[:.]/g, "-");
  const reportDir = wikidataReportDir(runId, options.dataRoot);
  await mkdir(reportDir, { recursive: true });

  await writeFile(
    join(reportDir, "quality-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  await writeFile(
    join(reportDir, "quality-report.md"),
    renderQualityReportMarkdown(report),
    "utf8",
  );

  log(`Quality report → ${reportDir} (${report.summary.errors} errors, ${report.summary.warnings} warnings)`);

  return { report, reportDir, passed };
}

export type { ProcessedNormalizeMeta as ValidateProcessedMeta };
