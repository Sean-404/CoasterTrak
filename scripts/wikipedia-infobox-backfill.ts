/**
 * Fill missing coaster stats from English Wikipedia {{Infobox roller coaster}} wikitext
 * (MediaWiki API — not HTML scraping).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/wikipedia-infobox-backfill.ts [--dry-run] [--limit 50] [--delay-ms 350]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Requires: data/wikidata_coasters.json (for wikidata_id → enwikiTitle), or set WIKIDATA_COASTERS_PATH
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import {
  fetchInfoboxStatsForEnwikiTitle,
  type InfoboxCoasterStats,
} from "../src/lib/wikipedia-infobox-coaster";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import type { WikidataCoasterRow } from "../src/lib/wikidata-coasters";
import { isThrillCoaster } from "../src/lib/coaster-dedup";

const DRY_RUN = hasFlag("--dry-run");

type DbCoaster = {
  id: number;
  name: string;
  wikidata_id: string | null;
  coaster_type: string | null;
  manufacturer: string | null;
  length_ft: number | null;
  height_ft: number | null;
  speed_mph: number | null;
  duration_s: number | null;
  inversions: number | null;
};

function needsAnyStat(c: DbCoaster): boolean {
  return (
    c.length_ft == null ||
    c.height_ft == null ||
    c.speed_mph == null ||
    c.duration_s == null ||
    c.inversions == null
  );
}

function missingStatCount(c: DbCoaster): number {
  let n = 0;
  if (c.length_ft == null) n++;
  if (c.height_ft == null) n++;
  if (c.speed_mph == null) n++;
  if (c.duration_s == null) n++;
  if (c.inversions == null) n++;
  return n;
}

function likelyThrill(c: DbCoaster): boolean {
  return isThrillCoaster(
    {
      id: c.id,
      park_id: 0,
      name: c.name,
      coaster_type: c.coaster_type ?? "Unknown",
      manufacturer: c.manufacturer,
      status: "Operating",
      length_ft: c.length_ft,
      speed_mph: c.speed_mph,
      height_ft: c.height_ft,
      inversions: c.inversions,
      duration_s: c.duration_s,
      opening_year: null,
      closing_year: null,
    },
    null,
  );
}

function mergePatch(
  row: DbCoaster,
  stats: InfoboxCoasterStats,
): Record<string, string | number> | null {
  const patch: Record<string, string | number> = {};
  if (row.length_ft == null && stats.length_ft != null) patch.length_ft = stats.length_ft;
  if (row.height_ft == null && stats.height_ft != null) patch.height_ft = stats.height_ft;
  if (row.speed_mph == null && stats.speed_mph != null) patch.speed_mph = stats.speed_mph;
  if (row.duration_s == null && stats.duration_s != null) patch.duration_s = stats.duration_s;
  if (row.inversions == null && stats.inversions != null) patch.inversions = stats.inversions;
  if (Object.keys(patch).length === 0) return null;
  patch.last_synced_at = new Date().toISOString();
  return patch;
}

async function main() {
  const limit = arg("--limit") ? parseInt(arg("--limit")!, 10) : Infinity;
  const delayMs = arg("--delay-ms") ? parseInt(arg("--delay-ms")!, 10) : 350;
  const prioritizeThrill = !hasFlag("--no-prioritize-thrill");

  const wdPath = resolve(
    process.env.WIKIDATA_COASTERS_PATH?.trim() ?? "data/wikidata_coasters.json",
  );
  console.error(`Loading Wikidata snapshot for enwiki titles: ${wdPath}`);
  const wdRows = JSON.parse(await readFile(wdPath, "utf8")) as WikidataCoasterRow[];
  const titleByQid = new Map<string, string>();
  for (const r of wdRows) {
    if (r.wikidataId && r.enwikiTitle) titleByQid.set(r.wikidataId.trim().toUpperCase(), r.enwikiTitle);
  }
  console.error(`  ${titleByQid.size} Qids with English article titles.`);

  const supabase = createServiceRoleClient();
  console.error("Loading coasters from Supabase...");
  const { data: rows, error } = await fetchAllPages<DbCoaster>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select(
          "id, name, wikidata_id, coaster_type, manufacturer, length_ft, height_ft, speed_mph, duration_s, inversions",
        )
        .not("wikidata_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const candidates = (rows ?? [])
    .filter(needsAnyStat)
    .sort((a, b) => {
      const diffMissing = missingStatCount(b) - missingStatCount(a);
      if (diffMissing !== 0) return diffMissing;
      if (prioritizeThrill) {
        const ta = likelyThrill(a) ? 1 : 0;
        const tb = likelyThrill(b) ? 1 : 0;
        if (tb !== ta) return tb - ta;
      }
      return a.id - b.id;
    });
  console.error(`  ${candidates.length} coasters with wikidata_id and at least one missing stat field.`);

  let processed = 0;
  let updated = 0;
  let skippedNoTitle = 0;
  let skippedNoInfobox = 0;

  for (const row of candidates) {
    if (processed >= limit) break;
    const qid = row.wikidata_id!.trim().toUpperCase();
    const title = titleByQid.get(qid);
    if (!title) {
      skippedNoTitle++;
      continue;
    }

    processed++;
    console.error(`[${processed}] ${row.name} (${qid}) → ${title}`);

    const stats = await fetchInfoboxStatsForEnwikiTitle(title);
    await new Promise((r) => setTimeout(r, delayMs));

    if (!stats) {
      console.error("  No infobox stats parsed.");
      skippedNoInfobox++;
      continue;
    }

    const patch = mergePatch(row, stats);
    if (!patch) {
      console.error("  Infobox had no new fields for missing columns.");
      continue;
    }

    console.error(`  Patch: ${JSON.stringify(patch)}`);
    if (DRY_RUN) {
      updated++;
      continue;
    }

    const { error: upErr } = await supabase.from("coasters").update(patch).eq("id", row.id);
    if (upErr) console.error(`  Update failed: ${upErr.message}`);
    else {
      updated++;
      console.error("  OK");
    }
  }

  console.error(
    `\nDone. Processed ${processed}, updated ${updated}, no enwiki title ${skippedNoTitle}, no infobox ${skippedNoInfobox}.`,
  );
  if (DRY_RUN) console.error("(dry-run: no DB writes)");
}

runMain(main);
