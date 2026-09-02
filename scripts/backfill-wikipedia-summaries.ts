/**
 * Fill missing coaster `summary_text` (and `enwiki_title`) from English Wikipedia
 * page summaries — the lead extracts used on coaster detail pages for SEO / AdSense.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-wikipedia-summaries.ts [--dry-run] [--limit 100]
 */

import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import {
  clampSummaryText,
  resolveCoasterWikipediaSummary,
} from "../src/lib/wikipedia-summary";

type DbRow = {
  id: number;
  name: string;
  wikidata_id: string | null;
  enwiki_title: string | null;
  summary_text: string | null;
  parks: { name: string } | { name: string }[] | null;
};

function parkNameFromRow(row: DbRow): string | null {
  const p = row.parks;
  if (!p) return null;
  if (Array.isArray(p)) return p[0]?.name?.trim() || null;
  return p.name?.trim() || null;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const limit = arg("--limit") ? parseInt(arg("--limit")!, 10) : 500;
  const delayMs = arg("--delay-ms") ? parseInt(arg("--delay-ms")!, 10) : 250;

  const supabase = createServiceRoleClient();
  console.error("Loading coasters missing Wikipedia summaries...");
  const { data: rows, error } = await fetchAllPages<DbRow>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select("id, name, wikidata_id, enwiki_title, summary_text, parks(name)")
        .or("summary_text.is.null,summary_text.eq.")
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const candidates = (rows ?? []).filter(
    (r) =>
      !(r.summary_text && r.summary_text.trim().length > 40) &&
      (Boolean(r.enwiki_title?.trim()) || Boolean(r.wikidata_id?.trim()) || Boolean(r.name?.trim())),
  );
  console.error(
    `${candidates.length} candidates (processing up to ${limit})${dryRun ? " [dry-run]" : ""}`,
  );

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (processed >= limit) break;
    processed += 1;

    const summary = await resolveCoasterWikipediaSummary({
      rideName: row.name,
      parkName: parkNameFromRow(row),
      enwikiTitle: row.enwiki_title,
      wikidataId: row.wikidata_id,
    });
    const extract = summary?.extract?.trim() || null;
    if (!summary || !extract || extract.length < 40) {
      skipped += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    const summaryText = clampSummaryText(extract, 1200);
    console.error(`  #${row.id} ${row.name} ← ${summary.title}: ${summaryText.slice(0, 72)}…`);

    if (!dryRun) {
      const { error: upErr } = await supabase
        .from("coasters")
        .update({
          summary_text: summaryText,
          enwiki_title: summary.title,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) {
        console.error(`    failed: ${upErr.message}`);
      } else {
        updated += 1;
      }
    } else {
      updated += 1;
    }

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  console.error(`Done. processed=${processed} wouldUpdate/updated=${updated} skipped=${skipped}`);
}

runMain(main);
