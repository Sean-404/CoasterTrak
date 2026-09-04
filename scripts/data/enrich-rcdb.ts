/**
 * Apply an RCDB stats export to the Wikidata catalog snapshot (and optionally DB).
 *
 * Requires written permission from Duane / RCDB (Terms of Use). Gate with:
 *   --permission-granted
 * or env RCDB_PERMISSION_GRANTED=1
 *
 * Does NOT scrape rcdb.com. Provide a JSON export Duane shares or you are
 * licensed to produce, e.g.:
 *
 *   [
 *     { "rcdbId": "2832", "heightFt": 456, "speedMph": 128, "lengthFt": 3118 }
 *   ]
 *
 * Usage:
 *   npm run data:enrich-rcdb -- --permission-granted --from data/rcdb_stats.json
 *   npm run data:enrich-rcdb -- --permission-granted --from data/rcdb_stats.json --write-db [--dry-run]
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { arg, hasFlag, runMain } from "../lib/cli";
import { createServiceRoleClient } from "../lib/supabase-service";
import {
  buildRcdbExportMap,
  buildRcdbFieldOverridePatches,
  enrichWikidataRowsFromRcdbExport,
  type RcdbStatsExportRow,
} from "../../src/lib/coastertrak-data/enrich/rcdb";
import { normalizeRcdbId } from "../../src/lib/rcdb";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../../src/lib/supabase-fetch-all";
import type { WikidataCoasterRow } from "../../src/lib/wikidata-coasters";

function permissionGranted(): boolean {
  if (hasFlag("--permission-granted")) return true;
  const env = process.env.RCDB_PERMISSION_GRANTED?.trim().toLowerCase();
  return env === "1" || env === "true" || env === "yes";
}

type DbCoaster = {
  id: number;
  name: string;
  rcdb_id: string | null;
  length_ft: number | null;
  height_ft: number | null;
  speed_mph: number | null;
  duration_s: number | null;
  inversions: number | null;
  status: string | null;
};

async function writeDb(
  exportRows: RcdbStatsExportRow[],
  dryRun: boolean,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const byId = buildRcdbExportMap(exportRows);
  if (!byId.size) {
    console.error("Export produced no valid RCDB ids.");
    return;
  }

  const { data: rows, error } = await fetchAllPages<DbCoaster>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select(
          "id, name, rcdb_id, length_ft, height_ft, speed_mph, duration_s, inversions, status",
        )
        .not("rcdb_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (error) throw error;

  let updated = 0;
  let overridesWritten = 0;
  let linksWritten = 0;

  for (const row of rows ?? []) {
    const rcdbId = normalizeRcdbId(row.rcdb_id);
    if (!rcdbId) continue;
    const stats = byId.get(rcdbId);
    if (!stats) continue;

    const patch: Record<string, string | number> = {};
    if (row.length_ft == null && stats.lengthFt != null) patch.length_ft = stats.lengthFt;
    if (row.height_ft == null && stats.heightFt != null) patch.height_ft = stats.heightFt;
    if (row.speed_mph == null && stats.speedMph != null) patch.speed_mph = stats.speedMph;
    if (row.duration_s == null && stats.durationS != null) patch.duration_s = stats.durationS;
    if (row.inversions == null && stats.inversions != null) patch.inversions = stats.inversions;

    const overrides = buildRcdbFieldOverridePatches(row.id, rcdbId, row, stats);

    if (Object.keys(patch).length === 0 && overrides.length === 0) continue;

    console.error(
      `[${row.id}] ${row.name} (rcdb ${rcdbId}) patch=${JSON.stringify(patch)} overrides=${overrides.length}`,
    );

    if (dryRun) {
      updated += Object.keys(patch).length ? 1 : 0;
      overridesWritten += overrides.length;
      continue;
    }

    if (Object.keys(patch).length) {
      patch.last_synced_at = new Date().toISOString();
      const { error: updErr } = await supabase.from("coasters").update(patch).eq("id", row.id);
      if (updErr) throw updErr;
      updated++;
    }

    if (overrides.length) {
      const { error: ovErr } = await supabase.from("data_coaster_field_overrides").upsert(overrides, {
        onConflict: "coaster_id,field_name",
      });
      if (ovErr) throw ovErr;
      overridesWritten += overrides.length;
    }

    const { error: linkErr } = await supabase.from("data_coaster_source_links").upsert(
      {
        coaster_id: row.id,
        source: "rcdb",
        external_id: rcdbId,
        external_name: row.name,
        match_method: "exact_key",
        confidence: 1,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "coaster_id,source" },
    );
    if (linkErr) throw linkErr;
    linksWritten++;
  }

  console.error(
    `${dryRun ? "Dry-run: would update" : "Updated"} ${updated} coasters; ` +
      `${overridesWritten} field overrides; ${linksWritten} source links.`,
  );
}

async function main() {
  if (!permissionGranted()) {
    console.error(
      "RCDB enrich refused: written permission required.\n" +
        "Pass --permission-granted (or set RCDB_PERMISSION_GRANTED=1) only after Duane grants use.\n" +
        "See scripts/data/rcdb-permission-request.txt",
    );
    process.exit(1);
  }

  const fromPath = resolve(arg("--from") ?? "data/rcdb_stats.json");
  const inPath = resolve(arg("--in") ?? "data/wikidata_coasters.json");
  const writeDbFlag = hasFlag("--write-db");
  const dryRun = hasFlag("--dry-run");
  const skipSnapshot = hasFlag("--skip-snapshot");

  const raw = JSON.parse(await readFile(fromPath, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    console.error(`Expected a JSON array in ${fromPath}`);
    process.exit(1);
  }
  const exportRows = raw as RcdbStatsExportRow[];
  console.error(`Loaded ${exportRows.length} RCDB export rows from ${fromPath}`);

  if (!skipSnapshot) {
    const rows = JSON.parse(await readFile(inPath, "utf8")) as WikidataCoasterRow[];
    console.error(`Enriching snapshot ${inPath} (${rows.length} rows)…`);
    const result = enrichWikidataRowsFromRcdbExport(rows, exportRows);
    if (!dryRun) {
      await writeFile(inPath, JSON.stringify(result.rows, null, 2), "utf8");
      const metaPath = /\.json$/i.test(inPath)
        ? inPath.replace(/\.json$/i, ".meta.json")
        : `${inPath}.meta.json`;
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
      } catch {
        meta = {};
      }
      meta = {
        ...meta,
        rcdbEnrichedAt: new Date().toISOString(),
        rcdbEnrichFrom: fromPath,
        rcdbMatched: result.matched,
        rcdbFieldsFilled: result.fieldsFilled,
        rcdbUnmatchedExport: result.unmatchedExportIds.length,
        rowCount: result.rows.length,
      };
      await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
    }
    console.error(
      `${dryRun ? "Dry-run: would fill" : "Filled"} ${result.fieldsFilled} fields across ${result.matched} matched coasters` +
        (result.unmatchedExportIds.length
          ? ` (${result.unmatchedExportIds.length} export ids unmatched in snapshot)`
          : ""),
    );
  }

  if (writeDbFlag) {
    await writeDb(exportRows, dryRun);
  } else if (!skipSnapshot) {
    console.error("Snapshot updated. Pass --write-db to also null-fill Supabase + field_overrides.");
  }
}

runMain(main);
