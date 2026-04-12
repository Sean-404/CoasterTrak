/**
 * Join data/coaster_db.csv with data/wikidata_coasters.json by normalized name
 * (+ location when ambiguous). Writes data/coaster_wikidata_matches.json
 *
 * Usage:
 *   npx tsx scripts/merge-wikidata-coasters.ts [--csv data/coaster_db.csv] [--wikidata data/wikidata_coasters.json] [--out data/coaster_wikidata_matches.json]
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Papa from "papaparse";
import type { WikidataCoasterRow } from "../src/lib/wikidata-coasters";
import { matchAllCsvRows, type CsvCoasterRow } from "../src/lib/wikidata-merge";
import { arg, runMain } from "./lib/cli";

async function main() {
  const csvPath = resolve(arg("--csv") ?? "data/coaster_db.csv");
  const wdPath = resolve(arg("--wikidata") ?? "data/wikidata_coasters.json");
  const outPath = resolve(arg("--out") ?? "data/coaster_wikidata_matches.json");

  const [csvText, wdText] = await Promise.all([
    readFile(csvPath, "utf8"),
    readFile(wdPath, "utf8"),
  ]);

  const parsed = Papa.parse<CsvCoasterRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    console.error("CSV parse warnings:", parsed.errors.slice(0, 3));
  }

  const wikidataRows = JSON.parse(wdText) as WikidataCoasterRow[];
  const matches = matchAllCsvRows(parsed.data, wikidataRows);

  const summary = {
    csvRows: matches.length,
    matched: matches.filter((m) => m.wikidataId != null).length,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(
    outPath,
    JSON.stringify({ summary, matches }, null, 2),
    "utf8",
  );
  console.error(
    `Wrote ${summary.matched}/${summary.csvRows} matches to ${outPath}`,
  );
}

runMain(main);
