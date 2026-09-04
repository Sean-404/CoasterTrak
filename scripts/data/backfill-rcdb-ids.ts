/**
 * Backfill coasters.rcdb_id from the Wikidata snapshot (P2751).
 * Identifiers only — no RCDB content. Safe without RCDB permission.
 *
 *   npx tsx --env-file=.env.local scripts/data/backfill-rcdb-ids.ts [--dry-run] [--limit 500]
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { arg, hasFlag, runMain } from "../lib/cli";
import { createServiceRoleClient } from "../lib/supabase-service";
import { normalizeRcdbId } from "../../src/lib/rcdb";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../../src/lib/supabase-fetch-all";
import type { WikidataCoasterRow } from "../../src/lib/wikidata-coasters";

type DbCoaster = {
  id: number;
  wikidata_id: string | null;
  rcdb_id: string | null;
};

async function main() {
  const dryRun = hasFlag("--dry-run");
  const limit = arg("--limit") ? parseInt(arg("--limit")!, 10) : Infinity;
  const snapPath = resolve(
    arg("--in") ?? process.env.WIKIDATA_COASTERS_PATH?.trim() ?? "data/wikidata_coasters.json",
  );

  const snap = JSON.parse(await readFile(snapPath, "utf8")) as WikidataCoasterRow[];
  const rcdbByQid = new Map<string, string>();
  for (const row of snap) {
    const qid = row.wikidataId?.trim().toUpperCase();
    const rcdbId = normalizeRcdbId(row.rcdbId);
    if (!qid || !rcdbId) continue;
    rcdbByQid.set(qid, rcdbId);
  }
  console.error(`Snapshot: ${rcdbByQid.size} QIDs with RCDB ids from ${snapPath}`);

  const supabase = createServiceRoleClient();
  const { data: rows, error } = await fetchAllPages<DbCoaster>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select("id, wikidata_id, rcdb_id")
        .not("wikidata_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (error) throw error;

  let updated = 0;
  for (const row of rows ?? []) {
    if (updated >= limit) break;
    if (row.rcdb_id) continue;
    const qid = row.wikidata_id?.trim().toUpperCase();
    if (!qid) continue;
    const rcdbId = rcdbByQid.get(qid);
    if (!rcdbId) continue;

    console.error(`[${row.id}] ${qid} → rcdb ${rcdbId}`);
    if (!dryRun) {
      const { error: updErr } = await supabase
        .from("coasters")
        .update({ rcdb_id: rcdbId })
        .eq("id", row.id)
        .is("rcdb_id", null);
      if (updErr) {
        // Unique conflict on rcdb_id — skip rather than fail the whole run.
        console.error(`  skip: ${updErr.message}`);
        continue;
      }
    }
    updated++;
  }

  console.error(`${dryRun ? "Dry-run: would set" : "Set"} rcdb_id on ${updated} coasters.`);
}

runMain(main);
