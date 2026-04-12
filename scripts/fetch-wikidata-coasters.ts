/**
 * CLI: fetch roller coaster data from Wikidata SPARQL, optionally enrich from
 * English Wikipedia infoboxes, write JSON.
 *
 * Usage:
 *   npx tsx scripts/fetch-wikidata-coasters.ts [--out data/wikidata_coasters.json] [--max 5000] [--enrich] [--enrich-extra] [--enrich-limit 50]
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  fetchAllRollerCoasters,
  type WikidataCoasterRow,
} from "../src/lib/wikidata-coasters";
import {
  extractCoasterInfobox,
  fetchWikipediaArticleHtml,
  inferStatusFromText,
} from "../src/lib/wikipedia-infobox";
import { arg, hasFlag, runMain } from "./lib/cli";

function derivedFromBase(row: WikidataCoasterRow): WikidataCoasterRow {
  const speedMph =
    row.speedMph ??
    (row.speedMs != null ? row.speedMs * 2.23693629 : null);
  const lengthFt =
    row.lengthFt ?? (row.lengthM != null ? row.lengthM * 3.28084 : null);
  const heightFt =
    row.heightFt ?? (row.heightM != null ? row.heightM * 3.28084 : null);
  return { ...row, speedMph, lengthFt, heightFt };
}

async function enrichFromWikipedia(
  rows: WikidataCoasterRow[],
  limit: number,
  enrichExtra: boolean,
): Promise<WikidataCoasterRow[]> {
  const out: WikidataCoasterRow[] = [];
  let done = 0;
  for (const row of rows) {
    const statGaps =
      row.lengthM == null ||
      row.speedMs == null ||
      row.heightM == null ||
      row.inversions == null ||
      row.durationS == null;
    const metaGaps =
      enrichExtra && row.inversions == null;
    const statusUnknown = row.status === "unknown";
    const gaps = statGaps || metaGaps || statusUnknown;
    if (!row.enwikiTitle || !gaps || done >= limit) {
      out.push(derivedFromBase(row));
      continue;
    }
    try {
      const html = await fetchWikipediaArticleHtml(row.enwikiTitle);
      const ex = extractCoasterInfobox(html);
      const lengthM = row.lengthM ?? ex.lengthM;
      const heightM = row.heightM ?? ex.heightM;
      const speedMs =
        row.speedMs ??
        (ex.speedMph != null ? ex.speedMph / 2.23693629 : null);

      // Use Wikipedia infobox status/closing date to improve defunct detection.
      // Wikidata often lacks P730/P576 for removed rides.
      let status = row.status;
      if (status === "unknown") {
        const inferred = inferStatusFromText(ex.statusText);
        if (inferred) {
          status = inferred;
        } else if (ex.closingDate) {
          const closing = new Date(ex.closingDate);
          if (!Number.isNaN(closing.getTime()) && closing < new Date()) {
            status = "defunct";
          }
        }
      }

      const merged: WikidataCoasterRow = derivedFromBase({
        ...row,
        lengthM,
        heightM,
        speedMs,
        inversions: row.inversions ?? ex.inversions,
        durationS: row.durationS ?? ex.durationS,
        status,
      });
      out.push(merged);
      done += 1;
      await new Promise((r) => setTimeout(r, 800));
    } catch {
      out.push(derivedFromBase(row));
    }
  }
  return out;
}

async function main() {
  const outPath = resolve(arg("--out") ?? "data/wikidata_coasters.json");
  const max = parseInt(arg("--max") ?? "200000", 10);
  const enrich = hasFlag("--enrich");
  const enrichExtra = hasFlag("--enrich-extra");
  const enrichLimit = parseInt(arg("--enrich-limit") ?? "100", 10);
  const fromJson = hasFlag("--from-json");

  let rows: WikidataCoasterRow[];

  if (fromJson) {
    const { readFile: rf } = await import("node:fs/promises");
    const existing = JSON.parse(await rf(outPath, "utf8")) as WikidataCoasterRow[];
    rows = existing;
    console.error(`Loaded ${rows.length} rows from ${outPath} (--from-json mode, skipping Wikidata fetch).`);
  } else {
    console.error(`Fetching Wikidata (max ${max} items)...`);
    rows = await fetchAllRollerCoasters({
      maxRows: max,
      pageSize: 5000,
      delayMs: 1200,
      onPage: (_, offset) => {
        console.error(`  ... page offset ${offset}`);
      },
    });
    console.error(`Got ${rows.length} coasters (deduped).`);
  }

  let finalRows = rows.map(derivedFromBase);
  if (enrich) {
    console.error(
      `Enriching up to ${enrichLimit} rows from Wikipedia HTML (stat gaps${enrichExtra ? " + inversions/g-force" : ""})...`,
    );
    finalRows = await enrichFromWikipedia(rows, enrichLimit, enrichExtra);
  }

  await writeFile(outPath, JSON.stringify(finalRows, null, 2), "utf8");
  console.error(`Wrote ${finalRows.length} rows to ${outPath}`);
}

runMain(main);
