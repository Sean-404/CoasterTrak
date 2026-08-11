/**
 * Phase 7 — gated catalog publish (dry-run by default).
 *
 *   npx tsx scripts/data/publish-catalog.ts [--in data/wikidata_coasters.json]
 *   npx tsx --env-file=.env.local scripts/data/publish-catalog.ts --apply
 */

import { arg, hasFlag, runMain } from "../lib/cli";
import { gateAndPublishCatalog } from "../../src/lib/coastertrak-data/publish/gate";

async function main() {
  const minRowsArg = arg("--min-rows");
  const minRows = minRowsArg ? parseInt(minRowsArg, 10) : undefined;

  const result = await gateAndPublishCatalog({
    sourcePath: arg("--in") ?? "data/wikidata_coasters.json",
    metaPath: arg("--meta") ?? undefined,
    reportRunId: arg("--from-run"),
    minRows,
    failOnDuplicates: hasFlag("--fail-on-duplicates"),
    allowLiteMeta: hasFlag("--allow-lite-meta"),
    apply: hasFlag("--apply"),
    onProgress: (msg) => console.error(msg),
  });

  console.error(JSON.stringify(result, null, 2));

  if (!result.passed) {
    console.error("\nGated publish blocked.");
    process.exit(1);
  }

  if (!result.applied) {
    console.error("\nGated publish dry-run complete (snapshot written, Supabase unchanged).");
  } else {
    console.error("\nGated publish applied to Supabase.");
  }
}

runMain(main);
