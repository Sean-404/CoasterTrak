/**
 * Phase 3 — normalize a raw Wikidata ingest into a processed snapshot.
 * Does not write to production DB.
 *
 *   npx tsx scripts/data/normalize-wikidata.ts [--from-run {runId}] [--latest] [--no-backfill-quantities]
 */

import { arg, hasFlag, runMain } from "../lib/cli";
import { normalizeWikidataRaw } from "../../src/lib/coastertrak-data/normalize/wikidata";
import { latestWikidataRawRunId } from "../../src/lib/coastertrak-data/paths";

async function main() {
  let sourceRunId = arg("--from-run");
  if (hasFlag("--latest") || !sourceRunId) {
    sourceRunId = (await latestWikidataRawRunId()) ?? undefined;
  }

  const { runDir, meta, rowCount } = await normalizeWikidataRaw({
    sourceRunId,
    backfillQuantities: hasFlag("--no-backfill-quantities") ? false : undefined,
    onProgress: (msg) => console.error(msg),
  });

  console.error(`Wrote processed snapshot to ${runDir}`);
  console.error(
    JSON.stringify(
      {
        sourceRunId: meta.sourceRunId,
        rowCount,
        totalBindingsProcessed: meta.totalBindingsProcessed,
        skippedWikidataIds: meta.skippedWikidataIds,
        quantityBackfill: meta.quantityBackfill,
      },
      null,
      2,
    ),
  );
}

runMain(main);
