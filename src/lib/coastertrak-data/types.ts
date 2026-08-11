/** Shared types for the in-repo CoasterTrak Data pipeline. */

export type RawIngestMeta = {
  generatedAt: string;
  source: string;
  runId: string;
  endpoint: string;
  queryMode: string;
  usedLiteFallback: boolean;
  pageCount: number;
  totalBindings: number;
  uniqueItemCount: number;
  options: Record<string, unknown>;
};

export type RawIngestResult = {
  runDir: string;
  meta: RawIngestMeta;
};

export type ProcessedNormalizeMeta = {
  generatedAt: string;
  source: "wikidata";
  sourceRunId: string;
  sourceGeneratedAt: string;
  sourceQueryMode: string;
  sourceUsedLiteFallback: boolean;
  rowCount: number;
  totalBindingsProcessed: number;
  skippedWikidataIds: string[];
  quantityBackfill: boolean;
};

export type ProcessedNormalizeResult = {
  runDir: string;
  meta: ProcessedNormalizeMeta;
  rowCount: number;
};

export type QualitySeverity = "error" | "warning" | "info";

export type QualityFinding = {
  severity: QualitySeverity;
  code: string;
  message: string;
  wikidataId?: string;
  label?: string;
  details?: Record<string, unknown>;
};

export type QualityReportSummary = {
  errors: number;
  warnings: number;
  info: number;
  rowsMissingAllQuantities: number;
  rowsMissingPark: number;
  rowsMissingCoords: number;
  rowsMissingOpeningDate: number;
  statusCounts: Record<string, number>;
  sourceQueryMode: string | null;
  usedLiteFallback: boolean | null;
};

export type QualityReport = {
  generatedAt: string;
  sourcePath: string;
  metaPath: string | null;
  totalRows: number;
  summary: QualityReportSummary;
  findings: QualityFinding[];
};

export type QualityValidateResult = {
  report: QualityReport;
  reportDir: string;
  passed: boolean;
};
