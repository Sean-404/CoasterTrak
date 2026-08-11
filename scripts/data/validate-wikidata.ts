/**
 * Phase 4 — validate a Wikidata catalog snapshot and write a quality report.
 *
 *   npx tsx scripts/data/validate-wikidata.ts [--in path] [--from-processed-run id] [--latest]
 *   npx tsx scripts/data/validate-wikidata.ts --strict-incidents --min-rows 1000
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { arg, hasFlag, runMain } from "../lib/cli";
import {
  latestWikidataProcessedRunId,
  wikidataProcessedRunDir,
} from "../../src/lib/coastertrak-data/paths";
import type { ProcessedNormalizeMeta } from "../../src/lib/coastertrak-data/types";
import { validateAndWriteWikidataReport } from "../../src/lib/coastertrak-data/validate/wikidata";
import type { WikidataCoasterRow } from "../../src/lib/wikidata-coasters";

async function main() {
  const minRowsArg = arg("--min-rows");
  const minRows = minRowsArg ? parseInt(minRowsArg, 10) : undefined;

  let sourcePath = arg("--in");
  let metaPath = arg("--meta");
  let reportRunId = arg("--from-processed-run");

  if (!sourcePath) {
    const processedRunId =
      reportRunId ??
      (hasFlag("--latest") ? await latestWikidataProcessedRunId() : null) ??
      (await latestWikidataProcessedRunId());
    if (!processedRunId) {
      throw new Error(
        "No input path. Pass --in, --from-processed-run, or run normalize first.",
      );
    }
    reportRunId = processedRunId;
    sourcePath = join(wikidataProcessedRunDir(processedRunId), "coasters.json");
    metaPath = join(wikidataProcessedRunDir(processedRunId), "meta.json");
  } else {
    sourcePath = resolve(sourcePath);
    if (!metaPath && /\.json$/i.test(sourcePath)) {
      metaPath = sourcePath.replace(/\.json$/i, ".meta.json");
    }
  }

  const rows = JSON.parse(await readFile(sourcePath, "utf8")) as WikidataCoasterRow[];

  let meta: ProcessedNormalizeMeta | Record<string, unknown> | null = null;
  if (metaPath) {
    try {
      meta = JSON.parse(await readFile(metaPath, "utf8")) as ProcessedNormalizeMeta;
      reportRunId = reportRunId ?? (meta as ProcessedNormalizeMeta).sourceRunId;
    } catch {
      meta = null;
    }
  }

  const { report, reportDir, passed } = await validateAndWriteWikidataReport({
    rows,
    sourcePath,
    meta,
    metaPath: meta ? metaPath! : null,
    reportRunId,
    strictIncidents: hasFlag("--strict-incidents"),
    allowLiteMeta: hasFlag("--allow-lite-meta"),
    failOnWarnings: hasFlag("--fail-on-warnings"),
    minRows,
    onProgress: (msg) => console.error(msg),
  });

  console.error(JSON.stringify(report.summary, null, 2));
  console.error(`Report: ${reportDir}`);

  if (!passed) {
    console.error("\nValidation failed.");
    process.exit(1);
  }

  console.error("\nValidation passed.");
}

runMain(main);
