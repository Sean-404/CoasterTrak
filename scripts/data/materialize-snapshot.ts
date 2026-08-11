/**
 * Materialize the latest processed snapshot into the working catalog path
 * (`data/wikidata_coasters.json`) for enrich / analyze / validate / gated publish.
 *
 *   npx tsx scripts/data/materialize-snapshot.ts [--from-run {runId}] [--latest]
 */

import { arg, hasFlag, runMain } from "../lib/cli";
import { materializeWorkingSnapshot } from "../../src/lib/coastertrak-data/publish/working-snapshot";
import { latestWikidataProcessedRunId } from "../../src/lib/coastertrak-data/paths";

async function main() {
  let sourceRunId = arg("--from-run");
  if (hasFlag("--latest") || !sourceRunId) {
    sourceRunId = (await latestWikidataProcessedRunId()) ?? undefined;
  }

  const { outPath, metaPath, rowCount } = await materializeWorkingSnapshot({
    sourceRunId,
    onProgress: (msg) => console.error(msg),
  });

  console.error(`Wrote ${rowCount} rows to ${outPath}`);
  console.error(`Wrote metadata to ${metaPath}`);
}

runMain(main);
