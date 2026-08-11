/**
 * Phase 2 — immutable raw Wikidata ingest for CoasterTrak Data.
 * Does not write to production DB or replace wikidata:fetch.
 *
 *   npx tsx scripts/data/ingest-wikidata.ts [--max 200000] [--page-size 200] [--no-lite-fallback]
 */

import { arg, hasFlag, runMain } from "../lib/cli";
import { ingestWikidataRaw } from "../../src/lib/coastertrak-data/ingest/wikidata";

async function main() {
  const maxArg = arg("--max");
  const maxRows = maxArg ? parseInt(maxArg, 10) : undefined;
  const pageSizeArg = arg("--page-size");
  const pageSize = pageSizeArg ? parseInt(pageSizeArg, 10) : undefined;

  const { runDir, meta } = await ingestWikidataRaw({
    maxRows,
    pageSize,
    allowLiteFallback: !hasFlag("--no-lite-fallback"),
    onProgress: (msg) => console.error(msg),
  });

  console.error(`Wrote raw ingest to ${runDir}`);
  console.error(
    JSON.stringify(
      {
        runId: meta.runId,
        pageCount: meta.pageCount,
        totalBindings: meta.totalBindings,
        uniqueItemCount: meta.uniqueItemCount,
        queryMode: meta.queryMode,
      },
      null,
      2,
    ),
  );
}

runMain(main);
