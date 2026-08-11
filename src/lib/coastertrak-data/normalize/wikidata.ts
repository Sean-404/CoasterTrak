import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { shouldSkipWikidataCoasterId } from "@/lib/coaster-known-fixes";
import {
  enrichMissingQuantities,
  normalizeWikidataBindings,
  type WikidataCoasterRow,
  type WikidataSparqlBinding,
} from "@/lib/wikidata-coasters";

import {
  latestWikidataRawRunId,
  wikidataProcessedRunDir,
  wikidataRawRunDir,
} from "../paths";
import type {
  ProcessedNormalizeMeta,
  ProcessedNormalizeResult,
  RawIngestMeta,
} from "../types";

type RawPageFile = {
  offset: number;
  pageSize: number;
  queryMode: string;
  bindingCount: number;
  bindings: WikidataSparqlBinding[];
};

export type WikidataNormalizeOptions = {
  dataRoot?: string;
  /** Raw ingest run id; defaults to latest under data/raw/wikidata. */
  sourceRunId?: string;
  /** When raw meta used lite fallback, backfill stats via batched VALUES queries. */
  backfillQuantities?: boolean;
  onProgress?: (message: string) => void;
};

async function loadRawRun(
  runId: string,
  dataRoot: string,
): Promise<{ meta: RawIngestMeta; bindings: WikidataSparqlBinding[] }> {
  const runDir = wikidataRawRunDir(runId, dataRoot);
  const meta = JSON.parse(
    await readFile(join(runDir, "meta.json"), "utf8"),
  ) as RawIngestMeta;

  const pagesDir = join(runDir, "pages");
  const pageFiles = (await readdir(pagesDir))
    .filter((f) => f.endsWith(".json"))
    .sort();

  const bindings: WikidataSparqlBinding[] = [];
  for (const fileName of pageFiles) {
    const page = JSON.parse(
      await readFile(join(pagesDir, fileName), "utf8"),
    ) as RawPageFile;
    bindings.push(...page.bindings);
  }

  return { meta, bindings };
}

export async function normalizeWikidataRaw(
  options: WikidataNormalizeOptions = {},
): Promise<ProcessedNormalizeResult> {
  const dataRoot = options.dataRoot ?? "data";
  const log = options.onProgress ?? (() => {});

  const sourceRunId =
    options.sourceRunId ?? (await latestWikidataRawRunId(dataRoot));
  if (!sourceRunId) {
    throw new Error(
      `No raw Wikidata ingest found under ${wikidataRawRunDir("{runId}", dataRoot).replace("{runId}", "")}. Run npm run data:ingest-wikidata first.`,
    );
  }

  log(`Normalizing raw run ${sourceRunId}…`);
  const { meta: rawMeta, bindings } = await loadRawRun(sourceRunId, dataRoot);
  log(`  loaded ${bindings.length} bindings from ${rawMeta.pageCount} pages`);

  let rows = normalizeWikidataBindings(bindings);
  const skippedWikidataIds: string[] = [];
  rows = rows.filter((row) => {
    if (shouldSkipWikidataCoasterId(row.wikidataId)) {
      skippedWikidataIds.push(row.wikidataId);
      return false;
    }
    return true;
  });

  const shouldBackfill =
    options.backfillQuantities ??
    (rawMeta.usedLiteFallback && rawMeta.queryMode === "lite");
  let quantityBackfill = false;
  if (shouldBackfill) {
    log("  lite raw ingest — running quantity backfill against WDQS…");
    rows = await enrichMissingQuantities(rows);
    quantityBackfill = true;
  }

  const runDir = wikidataProcessedRunDir(sourceRunId, dataRoot);
  await mkdir(runDir, { recursive: true });

  const processedMeta: ProcessedNormalizeMeta = {
    generatedAt: new Date().toISOString(),
    source: "wikidata",
    sourceRunId,
    sourceGeneratedAt: rawMeta.generatedAt,
    sourceQueryMode: rawMeta.queryMode,
    sourceUsedLiteFallback: rawMeta.usedLiteFallback,
    rowCount: rows.length,
    totalBindingsProcessed: bindings.length,
    skippedWikidataIds,
    quantityBackfill,
  };

  await writeFile(
    join(runDir, "coasters.json"),
    JSON.stringify(rows, null, 2),
    "utf8",
  );
  await writeFile(
    join(runDir, "meta.json"),
    JSON.stringify(processedMeta, null, 2),
    "utf8",
  );

  log(`Done: ${rows.length} coasters → ${runDir}`);

  return { runDir, meta: processedMeta, rowCount: rows.length };
}

/** Convenience for tests or diffing against legacy snapshot format. */
export type { WikidataCoasterRow };
