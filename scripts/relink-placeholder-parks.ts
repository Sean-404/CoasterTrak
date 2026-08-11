/**
 * Move coasters off placeholder parks ("Other", Unknown / historical…) onto the
 * real parks named in the Wikidata snapshot.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/relink-placeholder-parks.ts
 *   npx tsx --env-file=.env.local scripts/relink-placeholder-parks.ts --apply
 *   npx tsx --env-file=.env.local scripts/relink-placeholder-parks.ts --latest --apply
 */

import fs from "node:fs";
import path from "node:path";
import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import { isCatalogHiddenParkName } from "../src/lib/park-match";
import { applyPlaceholderRelinkPlans } from "../src/lib/relink-placeholder-parks-apply";
import {
  planPlaceholderParkRelinks,
  type RelinkCoaster,
  type RelinkPark,
} from "../src/lib/relink-placeholder-parks";
import type { WikidataCoasterRow } from "../src/lib/wikidata-coasters";

function latestProcessedRunDir(): string {
  const root = path.join(process.cwd(), "data", "processed", "wikidata");
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "test-fixture")
    .map((d) => d.name)
    .sort();
  if (!dirs.length) throw new Error(`No processed Wikidata runs under ${root}`);
  return path.join(root, dirs[dirs.length - 1]!);
}

function loadWdByQid(snapshotPath: string): Map<string, WikidataCoasterRow> {
  const rows = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as WikidataCoasterRow[];
  const map = new Map<string, WikidataCoasterRow>();
  for (const row of rows) {
    const qid = row.wikidataId?.trim().toUpperCase();
    if (qid) map.set(qid, row);
  }
  return map;
}

async function main() {
  const apply = hasFlag("--apply");
  const runDir = arg("--run") ?? (hasFlag("--latest") || !arg("--snapshot") ? latestProcessedRunDir() : null);
  const snapshotPath =
    arg("--snapshot") ?? (runDir ? path.join(runDir, "coasters.json") : null);
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    throw new Error("Provide --snapshot PATH or --latest (processed Wikidata coasters.json)");
  }

  console.error(`Snapshot: ${snapshotPath}`);
  console.error(apply ? "Mode: APPLY" : "Mode: dry-run (pass --apply to write)");

  const wdByQid = loadWdByQid(snapshotPath);
  console.error(`Wikidata rows indexed: ${wdByQid.size}`);

  const supabase = createServiceRoleClient();

  const { data: parks, error: parkErr } = await fetchAllPages<RelinkPark>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("parks")
        .select("id, name, country, latitude, longitude, external_source, external_id")
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (parkErr) throw parkErr;

  const { data: coasters, error: coasterErr } = await fetchAllPages<RelinkCoaster>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select(
          "id, name, park_id, wikidata_id, external_source, external_id, manufacturer, length_ft, speed_mph, height_ft, inversions, duration_s, image_url, status, coaster_type, opening_year, closing_year, enwiki_title, summary_text",
        )
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (coasterErr) throw coasterErr;

  const placeholderParkIds = new Set(
    parks.filter((p) => isCatalogHiddenParkName(p.name)).map((p) => p.id),
  );
  const placeholderCount = coasters.filter((c) => placeholderParkIds.has(c.park_id)).length;
  console.error(`Placeholder parks: ${placeholderParkIds.size}; coasters on them: ${placeholderCount}`);

  const plans = planPlaceholderParkRelinks({ parks, coasters, wdByQid });
  const moves = plans.filter((p) => p.action === "move");
  const merges = plans.filter((p) => p.action === "merge");
  const skips = plans.filter((p) => p.action === "skip");

  console.error(`Plans: ${moves.length} move, ${merges.length} merge, ${skips.length} skip`);
  for (const p of [...moves, ...merges].slice(0, 25)) {
    if (p.action === "move") {
      console.error(`  MOVE  #${p.coasterId} ${p.coasterName}: ${p.fromParkName} → ${p.toParkName}`);
    } else {
      console.error(
        `  MERGE keep=#${p.keepId} drop=#${p.dropId} ${p.coasterName}: ${p.fromParkName} → ${p.toParkName}`,
      );
    }
  }
  if (moves.length + merges.length > 25) {
    console.error(`  … ${moves.length + merges.length - 25} more`);
  }

  const skipReasons = new Map<string, number>();
  for (const s of skips) {
    skipReasons.set(s.reason, (skipReasons.get(s.reason) ?? 0) + 1);
  }
  if (skipReasons.size) {
    console.error("Skip reasons:");
    for (const [reason, n] of [...skipReasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.error(`  ${n}× ${reason}`);
    }
  }

  if (!apply) {
    console.error("Dry-run complete. Re-run with --apply to write.");
    return;
  }

  const byId = new Map(coasters.map((c) => [c.id, c]));
  const { applied, failed } = await applyPlaceholderRelinkPlans(supabase, plans, byId);

  let deletedParks = 0;
  for (const park of parks.filter((p) => isCatalogHiddenParkName(p.name))) {
    const { count, error } = await supabase
      .from("coasters")
      .select("id", { count: "exact", head: true })
      .eq("park_id", park.id);
    if (error) continue;
    if ((count ?? 0) > 0) continue;
    const { error: delParkErr } = await supabase.from("parks").delete().eq("id", park.id);
    if (!delParkErr) deletedParks++;
  }

  console.error(`Applied ${applied} plans (${failed} failed). Deleted ${deletedParks} empty placeholder parks.`);
}

runMain(main);
