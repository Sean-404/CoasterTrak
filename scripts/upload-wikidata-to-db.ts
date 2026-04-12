/**
 * Read data/wikidata_coasters.json (produced by npm run wikidata:fetch) and
 * update the Supabase coasters table with enrichment fields.
 *
 * Prerequisites:
 *   1. Run the migration: supabase/migrations/001_coaster_enrichment.sql
 *   2. Run: npm run wikidata:fetch -- --out data/wikidata_coasters.json [--enrich]
 *   3. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   npx tsx scripts/upload-wikidata-to-db.ts [--wikidata data/wikidata_coasters.json] [--dry-run]
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { normalizeNameKey, type WikidataCoasterRow } from "../src/lib/wikidata-coasters";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

const DRY_RUN = process.argv.includes("--dry-run");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Create a .env.local file or set them in your environment.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// ---------------------------------------------------------------------------
// DB types
// ---------------------------------------------------------------------------

type DbCoaster = {
  id: number;
  name: string;
  park_id: number;
  manufacturer: string | null;
  parks: { name: string; country: string } | null;
};

type CoasterUpdate = {
  id: number;
  wikidata_id: string;
  length_ft: number | null;
  speed_mph: number | null;
  height_ft: number | null;
  inversions: number | null;
  opening_year: number | null;
  closing_year: number | null;
  status?: string;
  manufacturer?: string;
};

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function yearFromDate(d: string | null): number | null {
  if (!d) return null;
  const y = parseInt(d.slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
}

function buildIndex(rows: DbCoaster[]): Map<string, DbCoaster[]> {
  const map = new Map<string, DbCoaster[]>();
  for (const r of rows) {
    const k = normalizeNameKey(r.name);
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return map;
}

function pickBestMatch(
  candidates: DbCoaster[],
  wd: WikidataCoasterRow,
): DbCoaster {
  if (candidates.length === 1) return candidates[0];
  const wdPark = (wd.parkLabel ?? "").toLowerCase();
  const wdCountry = (wd.countryLabel ?? "").toLowerCase();
  for (const c of candidates) {
    const parkName = (c.parks?.name ?? "").toLowerCase();
    const country = (c.parks?.country ?? "").toLowerCase();
    if (wdPark && (parkName.includes(wdPark) || wdPark.includes(parkName)))
      return c;
    if (wdCountry && country.includes(wdCountry)) return c;
  }
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const wdPath = resolve(
    arg("--wikidata") ?? "data/wikidata_coasters.json",
  );

  console.error(`Reading Wikidata JSON from ${wdPath}...`);
  const wdRows = JSON.parse(
    await readFile(wdPath, "utf8"),
  ) as WikidataCoasterRow[];
  console.error(`  ${wdRows.length} Wikidata entries.`);

  // Load all coasters from the DB, including park name/country for matching
  console.error("Loading coasters from Supabase...");
  const { data: dbCoasters, error: dbErr } = await supabase
    .from("coasters")
    .select("id, name, park_id, manufacturer, parks(name, country)");
  if (dbErr) {
    console.error("Supabase error:", dbErr.message);
    process.exit(1);
  }
  const coasters = (dbCoasters ?? []) as unknown as DbCoaster[];
  console.error(`  ${coasters.length} DB coasters loaded.`);

  const index = buildIndex(coasters);

  // Build update list
  const updates: CoasterUpdate[] = [];
  for (const wd of wdRows) {
    const k = normalizeNameKey(wd.label);
    const candidates = index.get(k);
    if (!candidates?.length) continue;

    const match = pickBestMatch(candidates, wd);

    const update: CoasterUpdate = {
      id: match.id,
      wikidata_id: wd.wikidataId,
      length_ft: wd.lengthFt != null ? Math.round(wd.lengthFt) : null,
      speed_mph: wd.speedMph != null ? Math.round(wd.speedMph) : null,
      height_ft: wd.heightFt != null ? Math.round(wd.heightFt) : null,
      inversions: wd.inversions,
      opening_year: yearFromDate(wd.openingDate),
      closing_year:
        yearFromDate(wd.demolishedDate) ?? yearFromDate(wd.retirementDate),
    };

    // Only override status when Wikidata has a confident signal
    if (wd.status === "defunct") update.status = "Defunct";

    // Only fill manufacturer when the DB row has none (Kaggle data takes priority)
    const dbManufacturer = match.manufacturer ?? null;
    if (!dbManufacturer && wd.manufacturerLabel) {
      update.manufacturer = wd.manufacturerLabel;
    }

    updates.push(update);
  }

  // Deduplicate by DB id (keep first match per coaster)
  const seen = new Set<number>();
  const deduped = updates.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });

  console.error(
    `Matched ${deduped.length} / ${wdRows.length} Wikidata entries to DB coasters.`,
  );

  if (DRY_RUN) {
    console.error("--dry-run: skipping DB writes.");
    console.log(JSON.stringify(deduped.slice(0, 5), null, 2));
    return;
  }

  // Batch updates in chunks of 200
  const CHUNK = 200;
  let updated = 0;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
    for (const u of chunk) {
      const { id, ...fields } = u;
      const { error } = await supabase
        .from("coasters")
        .update(fields)
        .eq("id", id);
      if (error) {
        console.error(`  Update failed for id=${id}: ${error.message}`);
      } else {
        updated += 1;
      }
    }
    console.error(`  ${Math.min(i + CHUNK, deduped.length)} / ${deduped.length} updated...`);
  }

  console.error(`Done. Updated ${updated} coasters in Supabase.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
