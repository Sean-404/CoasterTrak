/**
 * Copy a processed CoasterTrak Data snapshot into the legacy paths used by
 * validate / upload / catalog sync (`data/wikidata_coasters.json`).
 *
 *   npx tsx scripts/data/publish-processed-snapshot.ts [--from-run {runId}] [--latest]
 */

import { arg, hasFlag, runMain } from "../lib/cli";
import { publishProcessedSnapshot } from "../../src/lib/coastertrak-data/publish/legacy-snapshot";
import { latestWikidataProcessedRunId } from "../../src/lib/coastertrak-data/paths";

async function main() {
  let sourceRunId = arg("--from-run");
  if (hasFlag("--latest") || !sourceRunId) {
    sourceRunId = (await latestWikidataProcessedRunId()) ?? undefined;
  }

  const { outPath, metaPath, rowCount } = await publishProcessedSnapshot({
    sourceRunId,
    onProgress: (msg) => console.error(msg),
  });

  console.error(`Wrote ${rowCount} rows to ${outPath}`);
  console.error(`Wrote metadata to ${metaPath}`);
}

runMain(main);
