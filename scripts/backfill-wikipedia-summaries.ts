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
  fetchEnwikiTitleFromWikidata,
  fetchWikipediaSummary,
  type WikipediaSummary,
} from "../src/lib/wikipedia-summary";

type DbRow = {
  id: number;
  name: string;
  wikidata_id: string | null;
  enwiki_title: string | null;
  summary_text: string | null;
};

/** Reject park/disaster/person articles that Wikipedia redirects can land on. */
function isLikelyCoasterSummary(rideName: string, summary: WikipediaSummary): boolean {
  const extract = summary.extract.toLowerCase();
  const title = summary.title.toLowerCase();
  if (
    /\b(disaster|accident|incident|derailment|collision)\b/.test(title) ||
    /\b(disaster|accident|incident)\b/.test(extract.slice(0, 160))
  ) {
    return false;
  }

  const rideTokens = rideName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !["the", "and", "with", "from", "roller", "coaster"].includes(t));
  const titleHits = rideTokens.filter((t) => title.includes(t)).length;
  const extractHits = rideTokens.filter((t) => extract.includes(t)).length;
  const strongHits = rideTokens.filter(
    (t) => t.length >= 6 && (title.includes(t) || extract.includes(t)),
  ).length;
  const nameOverlap = strongHits >= 1 || titleHits + extractHits >= 2;

  if (/\b(roller coaster|steel coaster|wooden coaster|launched roller coaster|mine train)\b/.test(extract)) {
    // Allow generic model articles only when the ride name is short/generic (e.g. "Toboggan").
    return nameOverlap || rideTokens.length === 0;
  }
  if (/\bcoaster\b/.test(extract)) {
    if (/\b(amusement park|theme park|summer resort|water park)\b/.test(extract.slice(0, 120))) {
      return false;
    }
    return nameOverlap;
  }
  return titleHits >= Math.min(2, Math.max(rideTokens.length, 1));
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
        .select("id, name, wikidata_id, enwiki_title, summary_text")
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
      (Boolean(r.enwiki_title?.trim()) || Boolean(r.wikidata_id?.trim())),
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

    let title = row.enwiki_title?.trim() || null;
    if (!title && row.wikidata_id) {
      title = await fetchEnwikiTitleFromWikidata(row.wikidata_id);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, Math.min(delayMs, 150)));
    }
    if (!title) {
      skipped += 1;
      continue;
    }

    const summary = await fetchWikipediaSummary(title);
    const extract = summary?.extract?.trim() || null;
    if (!summary || !extract || extract.length < 40 || !isLikelyCoasterSummary(row.name, summary)) {
      skipped += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    const summaryText = clampSummaryText(extract, 1200);
    console.error(`  #${row.id} ${row.name} ← ${summaryText.slice(0, 72)}…`);

    if (!dryRun) {
      const { error: upErr } = await supabase
        .from("coasters")
        .update({
          summary_text: summaryText,
          ...(row.enwiki_title?.trim() ? {} : { enwiki_title: summary?.title || title }),
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
