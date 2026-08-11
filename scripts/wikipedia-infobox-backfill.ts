/**
 * Fill missing coaster fields from English Wikipedia roller-coaster infoboxes
 * (MediaWiki wikitext API — not HTML scraping).
 *
 * Fills: length/height/speed/duration/inversions, manufacturer, coaster_type.
 * Resolves article titles from DB `enwiki_title`, Wikidata snapshot, or live sitelinks.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/wikipedia-infobox-backfill.ts [--dry-run] [--limit 50] [--delay-ms 350]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: data/wikidata_coasters.json (or WIKIDATA_COASTERS_PATH) for QID → enwiki titles
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import {
  fetchInfoboxStatsForEnwikiTitle,
  type InfoboxCoasterStats,
} from "../src/lib/wikipedia-infobox-coaster";
import { fetchEnwikiTitleFromWikidata } from "../src/lib/wikipedia-summary";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import type { WikidataCoasterRow } from "../src/lib/wikidata-coasters";
import { isThrillCoaster } from "../src/lib/coaster-dedup";

const DRY_RUN = hasFlag("--dry-run");

type DbCoaster = {
  id: number;
  name: string;
  wikidata_id: string | null;
  enwiki_title: string | null;
  coaster_type: string | null;
  manufacturer: string | null;
  length_ft: number | null;
  height_ft: number | null;
  speed_mph: number | null;
  duration_s: number | null;
  inversions: number | null;
};

function typeMissing(c: DbCoaster): boolean {
  const t = (c.coaster_type ?? "").trim();
  return !t || t === "Unknown" || t === "Other";
}

function manufacturerMissing(c: DbCoaster): boolean {
  return !c.manufacturer?.trim();
}

function needsAnyFill(c: DbCoaster): boolean {
  return (
    c.length_ft == null ||
    c.height_ft == null ||
    c.speed_mph == null ||
    c.duration_s == null ||
    c.inversions == null ||
    typeMissing(c) ||
    manufacturerMissing(c)
  );
}

function missingFillCount(c: DbCoaster): number {
  let n = 0;
  if (c.length_ft == null) n++;
  if (c.height_ft == null) n++;
  if (c.speed_mph == null) n++;
  if (c.duration_s == null) n++;
  if (c.inversions == null) n++;
  if (typeMissing(c)) n++;
  if (manufacturerMissing(c)) n++;
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
  resolvedTitle: string | null,
): Record<string, string | number> | null {
  const patch: Record<string, string | number> = {};
  if (row.length_ft == null && stats.length_ft != null) patch.length_ft = stats.length_ft;
  if (row.height_ft == null && stats.height_ft != null) patch.height_ft = stats.height_ft;
  if (row.speed_mph == null && stats.speed_mph != null) patch.speed_mph = stats.speed_mph;
  if (row.duration_s == null && stats.duration_s != null) patch.duration_s = stats.duration_s;
  if (row.inversions == null && stats.inversions != null) patch.inversions = stats.inversions;
  if (manufacturerMissing(row) && stats.manufacturer) patch.manufacturer = stats.manufacturer;
  if (typeMissing(row) && stats.coaster_type) patch.coaster_type = stats.coaster_type;
  if (!row.enwiki_title?.trim() && resolvedTitle) patch.enwiki_title = resolvedTitle;
  if (Object.keys(patch).length === 0) return null;
  patch.last_synced_at = new Date().toISOString();
  return patch;
}

async function loadTitleByQid(): Promise<Map<string, string>> {
  const titleByQid = new Map<string, string>();
  const wdPath = resolve(
    process.env.WIKIDATA_COASTERS_PATH?.trim() ?? "data/wikidata_coasters.json",
  );
  try {
    const wdRows = JSON.parse(await readFile(wdPath, "utf8")) as WikidataCoasterRow[];
    for (const r of wdRows) {
      if (r.wikidataId && r.enwikiTitle) {
        titleByQid.set(r.wikidataId.trim().toUpperCase(), r.enwikiTitle);
      }
    }
    console.error(`  Snapshot titles: ${titleByQid.size} QIDs from ${wdPath}`);
  } catch {
    console.error(`  No Wikidata snapshot at ${wdPath} (will use DB titles + live sitelinks).`);
  }
  return titleByQid;
}

async function resolveTitle(
  row: DbCoaster,
  titleByQid: Map<string, string>,
): Promise<string | null> {
  const fromDb = row.enwiki_title?.trim();
  if (fromDb) return fromDb;
  const qid = row.wikidata_id?.trim().toUpperCase();
  if (!qid) return null;
  const fromSnap = titleByQid.get(qid);
  if (fromSnap) return fromSnap;
  return fetchEnwikiTitleFromWikidata(qid);
}

async function main() {
  const limit = arg("--limit") ? parseInt(arg("--limit")!, 10) : Infinity;
  const delayMs = arg("--delay-ms") ? parseInt(arg("--delay-ms")!, 10) : 350;
  const prioritizeThrill = !hasFlag("--no-prioritize-thrill");

  console.error("Loading enwiki title map…");
  const titleByQid = await loadTitleByQid();

  const supabase = createServiceRoleClient();
  console.error("Loading coasters from Supabase...");
  const { data: rows, error } = await fetchAllPages<DbCoaster>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select(
          "id, name, wikidata_id, enwiki_title, coaster_type, manufacturer, length_ft, height_ft, speed_mph, duration_s, inversions",
        )
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const candidates = (rows ?? [])
    .filter(
      (c) =>
        needsAnyFill(c) &&
        (Boolean(c.enwiki_title?.trim()) || Boolean(c.wikidata_id?.trim())),
    )
    .sort((a, b) => {
      const diffMissing = missingFillCount(b) - missingFillCount(a);
      if (diffMissing !== 0) return diffMissing;
      if (prioritizeThrill) {
        const ta = likelyThrill(a) ? 1 : 0;
        const tb = likelyThrill(b) ? 1 : 0;
        if (tb !== ta) return tb - ta;
      }
      return a.id - b.id;
    });
  console.error(
    `  ${candidates.length} coasters with a Wikipedia/Wikidata handle and at least one fillable gap.`,
  );

  let processed = 0;
  let updated = 0;
  let skippedNoTitle = 0;
  let skippedNoInfobox = 0;

  for (const row of candidates) {
    if (processed >= limit) break;

    const title = await resolveTitle(row, titleByQid);
    if (!title) {
      skippedNoTitle++;
      continue;
    }

    processed++;
    const qid = row.wikidata_id?.trim() || "no-qid";
    console.error(`[${processed}] ${row.name} (${qid}) → ${title}`);

    const stats = await fetchInfoboxStatsForEnwikiTitle(title);
    await new Promise((r) => setTimeout(r, delayMs));

    if (!stats) {
      console.error("  No infobox fields parsed.");
      skippedNoInfobox++;
      continue;
    }

    const patch = mergePatch(row, stats, title);
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
