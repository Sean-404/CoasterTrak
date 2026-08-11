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
