import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  latestWikidataProcessedRunId,
  wikidataProcessedRunDir,
} from "../paths";
import type { ProcessedNormalizeMeta } from "../types";

export type MaterializeWorkingSnapshotOptions = {
  dataRoot?: string;
  sourceRunId?: string;
  /** Working snapshot path used by enrich / analyze / validate / gated publish. */
  outPath?: string;
  onProgress?: (message: string) => void;
};

/** Copy the latest processed run into the stable working catalog path. */
export async function materializeWorkingSnapshot(
  options: MaterializeWorkingSnapshotOptions = {},
): Promise<{ outPath: string; metaPath: string; rowCount: number }> {
  const dataRoot = options.dataRoot ?? "data";
  const log = options.onProgress ?? (() => {});

  const sourceRunId =
    options.sourceRunId ?? (await latestWikidataProcessedRunId(dataRoot));
  if (!sourceRunId) {
    throw new Error(
      "No processed Wikidata snapshot found. Run npm run data:normalize-wikidata first.",
    );
  }

  const runDir = wikidataProcessedRunDir(sourceRunId, dataRoot);
  const coastersPath = join(runDir, "coasters.json");
  const processedMeta = JSON.parse(
    await readFile(join(runDir, "meta.json"), "utf8"),
  ) as ProcessedNormalizeMeta;

  const outPath = resolve(options.outPath ?? "data/wikidata_coasters.json");
  const metaPath = /\.json$/i.test(outPath)
    ? outPath.replace(/\.json$/i, ".meta.json")
    : `${outPath}.meta.json`;

  await copyFile(coastersPath, outPath);
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        generatedAt: processedMeta.generatedAt,
        source: "coastertrak-data",
        pipeline: "ingest+normalize",
        sourceRunId: processedMeta.sourceRunId,
        sourceQueryMode: processedMeta.sourceQueryMode,
        outPath,
        rowCount: processedMeta.rowCount,
        allowLiteFallback: true,
        usedLiteFallback: processedMeta.sourceUsedLiteFallback,
        quantityBackfill: processedMeta.quantityBackfill,
        skippedWikidataIds: processedMeta.skippedWikidataIds,
      },
      null,
      2,
    ),
    "utf8",
  );

  log(
    `Materialized ${processedMeta.rowCount} rows from ${sourceRunId} → ${outPath}`,
  );

  return { outPath, metaPath, rowCount: processedMeta.rowCount };
}

/** @deprecated Use materializeWorkingSnapshot */
export const publishProcessedSnapshot = materializeWorkingSnapshot;
