/**
 * Enrich a catalog snapshot from English Wikipedia infoboxes.
 *
 *   npx tsx scripts/data/enrich-wikipedia.ts [--in data/wikidata_coasters.json] [--enrich-limit 1000]
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { arg, hasFlag, runMain } from "../lib/cli";
import { enrichWikidataRowsFromWikipedia } from "../../src/lib/coastertrak-data/enrich/wikipedia";
import type { WikidataCoasterRow } from "../../src/lib/wikidata-coasters";

async function main() {
  const inPath = resolve(arg("--in") ?? "data/wikidata_coasters.json");
  const metaPath = /\.json$/i.test(inPath)
    ? inPath.replace(/\.json$/i, ".meta.json")
    : `${inPath}.meta.json`;
  const enrichLimit = parseInt(arg("--enrich-limit") ?? "1000", 10);
  const enrichExtra = hasFlag("--enrich-extra");

  const rows = JSON.parse(await readFile(inPath, "utf8")) as WikidataCoasterRow[];
  console.error(
    `Enriching ${rows.length} rows from Wikipedia (limit ${enrichLimit}${enrichExtra ? ", extra" : ""})…`,
  );

  const enriched = await enrichWikidataRowsFromWikipedia(rows, {
    limit: enrichLimit,
    enrichExtra,
    onProgress: (msg) => console.error(msg),
  });

  await writeFile(inPath, JSON.stringify(enriched, null, 2), "utf8");

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
  } catch {
    meta = {};
  }
  meta = {
    ...meta,
    enrichedAt: new Date().toISOString(),
    enrich: true,
    enrichExtra,
    enrichLimit,
    rowCount: enriched.length,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

  console.error(`Wrote ${enriched.length} rows to ${inPath}`);
}

runMain(main);
