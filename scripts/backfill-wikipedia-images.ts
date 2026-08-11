/**
 * Fill missing coaster image_url from English Wikipedia page summaries
 * when Wikidata has no P18 image.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-wikipedia-images.ts [--dry-run] [--limit 100]
 */

import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import { sanitizeCoasterImageUrl } from "../src/lib/coaster-known-fixes";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import {
  fetchEnwikiTitleFromWikidata,
  fetchWikipediaSummary,
} from "../src/lib/wikipedia-summary";

type DbRow = {
  id: number;
  name: string;
  wikidata_id: string | null;
  enwiki_title: string | null;
  image_url: string | null;
};

async function main() {
  const dryRun = hasFlag("--dry-run");
  const limit = arg("--limit") ? parseInt(arg("--limit")!, 10) : 200;
  const delayMs = arg("--delay-ms") ? parseInt(arg("--delay-ms")!, 10) : 250;

  const supabase = createServiceRoleClient();
  console.error("Loading coasters missing images...");
  const { data: rows, error } = await fetchAllPages<DbRow>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select("id, name, wikidata_id, enwiki_title, image_url")
        .is("image_url", null)
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const candidates = (rows ?? []).filter(
    (r) => Boolean(r.enwiki_title?.trim()) || Boolean(r.wikidata_id?.trim()),
  );
  console.error(`${candidates.length} candidates (processing up to ${limit})${dryRun ? " [dry-run]" : ""}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (processed >= limit) break;
    processed += 1;

    let title = row.enwiki_title?.trim() || null;
    if (!title && row.wikidata_id) {
      title = await fetchEnwikiTitleFromWikidata(row.wikidata_id);
    }
    if (!title) {
      skipped += 1;
      continue;
    }

    const summary = await fetchWikipediaSummary(title);
    const imageUrl = sanitizeCoasterImageUrl(summary?.imageUrl ?? null);
    if (!imageUrl) {
      skipped += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    console.error(`  #${row.id} ${row.name} ← ${imageUrl.slice(0, 80)}…`);
    if (!dryRun) {
      const { error: upErr } = await supabase
        .from("coasters")
        .update({
          image_url: imageUrl,
          ...(row.enwiki_title ? {} : { enwiki_title: title }),
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
