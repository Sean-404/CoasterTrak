/**
 * Normalize mixed legacy coaster statuses in DB to lifecycle-only values:
 * Operating / Defunct / Unknown.
 *
 * Usage:
 *   npx tsx scripts/normalize-coaster-statuses.ts [--dry-run] [--limit 500]
 */

import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import { normalizeLifecycleStatus } from "../src/lib/coaster-status";

type DbCoasterStatusRow = {
  id: number;
  name: string;
  status: string | null;
  closing_year: number | null;
};

async function main() {
  const dryRun = hasFlag("--dry-run");
  const limit = arg("--limit") ? parseInt(arg("--limit")!, 10) : Infinity;
  const supabase = createServiceRoleClient();

  console.error("Loading coaster statuses...");
  const { data: rows, error } = await fetchAllPages<DbCoasterStatusRow>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select("id, name, status, closing_year")
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (error) {
    console.error(`Supabase error: ${error.message}`);
    process.exit(1);
  }

  const updates = rows
    .map((r) => {
      const normalized = normalizeLifecycleStatus(r.status, { closingYear: r.closing_year });
      return {
        id: r.id,
        name: r.name,
        before: r.status ?? "NULL",
        after: normalized,
      };
    })
    .filter((u) => u.before !== u.after)
    .slice(0, limit);

  console.error(`Found ${updates.length} coaster rows needing status normalization.`);
  if (updates.length) {
    console.error("Sample:");
    for (const u of updates.slice(0, 10)) {
      console.error(`  [${u.id}] ${u.name}: "${u.before}" -> "${u.after}"`);
    }
  }

  if (dryRun) {
    console.error("--dry-run enabled; no DB writes.");
    return;
  }

  let applied = 0;
  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("coasters")
      .update({
        status: u.after,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", u.id);
    if (upErr) {
      console.error(`Update failed for id=${u.id}: ${upErr.message}`);
      continue;
    }
    applied++;
  }
  console.error(`Done. Normalized ${applied} statuses.`);
}

runMain(main);
