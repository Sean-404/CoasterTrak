/**
 * Phase 5 — dedupe/conflict analysis + ThemeParks.wiki snapshot verification.
 *
 *   npx tsx scripts/data/analyze-catalog.ts [--from-processed-run id] [--latest]
 *   npx tsx scripts/data/analyze-catalog.ts --in data/wikidata_coasters.json --skip-themeparks
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { arg, hasFlag, runMain } from "../lib/cli";
import { analyzeCatalogSnapshot } from "../../src/lib/coastertrak-data/analyze/catalog";
import {
  latestWikidataProcessedRunId,
  wikidataProcessedRunDir,
} from "../../src/lib/coastertrak-data/paths";
import type { ProcessedNormalizeMeta } from "../../src/lib/coastertrak-data/types";
import type { WikidataCoasterRow } from "../../src/lib/wikidata-coasters";

async function main() {
  let sourcePath = arg("--in");
  let reportRunId = arg("--from-processed-run");
  const maxParksArg = arg("--max-parks");
  const maxParks = maxParksArg ? parseInt(maxParksArg, 10) : undefined;

  if (!sourcePath) {
    const processedRunId =
      reportRunId ??
      (hasFlag("--latest") ? await latestWikidataProcessedRunId() : null) ??
      (await latestWikidataProcessedRunId());
    if (!processedRunId) {
      throw new Error("Pass --in or run normalize first.");
    }
    reportRunId = processedRunId;
    sourcePath = join(wikidataProcessedRunDir(processedRunId), "coasters.json");
  } else {
    sourcePath = resolve(sourcePath);
    if (!reportRunId) {
      try {
        const meta = JSON.parse(
          await readFile(
            sourcePath.replace(/coasters\.json$/i, "meta.json"),
            "utf8",
          ),
        ) as ProcessedNormalizeMeta;
        reportRunId = meta.sourceRunId;
      } catch {
        reportRunId = new Date().toISOString().replace(/[:.]/g, "-");
      }
    }
  }

  if (!reportRunId) {
    reportRunId = new Date().toISOString().replace(/[:.]/g, "-");
  }

  const rows = JSON.parse(await readFile(sourcePath, "utf8")) as WikidataCoasterRow[];

  const { reportDir, passed, dedupe, themeparks } = await analyzeCatalogSnapshot({
    rows,
    sourcePath,
    reportRunId,
    skipThemeParks: hasFlag("--skip-themeparks"),
    maxParks,
    delayMs: parseInt(arg("--delay-ms") ?? "300", 10),
    failOnDuplicates: hasFlag("--fail-on-duplicates"),
    onProgress: (msg) => console.error(msg),
  });

  console.error(
    JSON.stringify(
      {
        reportDir,
        dedupeErrors: dedupe.summary.errors,
        duplicateGroups: dedupe.summary.duplicateGroups,
        themeparksMatched: themeparks?.totals.matched ?? null,
        themeparksLocalOnly: themeparks?.totals.localOnly ?? null,
        passed,
      },
      null,
      2,
    ),
  );

  if (!passed) {
    console.error("\nCatalog analysis failed.");
    process.exit(1);
  }

  console.error("\nCatalog analysis passed.");
}

runMain(main);
