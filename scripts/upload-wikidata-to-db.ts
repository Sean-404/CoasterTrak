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
import {
  inferCoasterType,
  wikidataInsertName,
  yearFromDate,
} from "../src/lib/wikidata-coaster-inference";

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
  coaster_type: string | null;
  manufacturer: string | null;
  parks: {
    name: string;
    country: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
};

type DbPark = {
  id: number;
  name: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

type CoasterUpdate = {
  id: number;
  wikidata_id: string;
  length_ft: number | null;
  speed_mph: number | null;
  height_ft: number | null;
  inversions?: number;       // omit rather than null — never wipe existing value
  duration_s?: number;
  opening_year?: number;
  closing_year?: number;
  status?: string;
  manufacturer?: string;
  coaster_type?: string;
};

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/** Strip common ride-type suffixes so "Hulk Coaster" matches "Hulk". */
function stripRideSuffix(name: string): string {
  return name
    .replace(/\s+(roller\s+)?coaster\s*$/i, "")
    .replace(/\s+ride\s*$/i, "")
    .trim();
}

/**
 * Wikidata `label` is often short ("Nemesis") while enwikiTitle matches the live
 * name ("Nemesis Reborn"). Try every variant so we still match the DB row.
 */
function lookupCandidates(
  index: Map<string, DbCoaster[]>,
  wd: WikidataCoasterRow,
): DbCoaster[] | undefined {
  const keys: string[] = [
    normalizeNameKey(wd.label),
    normalizeNameKey(stripRideSuffix(wd.label)),
  ];
  if (wd.enwikiTitle) {
    keys.push(
      normalizeNameKey(wd.enwikiTitle),
      normalizeNameKey(stripRideSuffix(wd.enwikiTitle)),
    );
  }
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const c = index.get(key);
    if (c?.length) return c;
  }
  return undefined;
}

function buildIndex(rows: DbCoaster[]): Map<string, DbCoaster[]> {
  const map = new Map<string, DbCoaster[]>();
  for (const r of rows) {
    // Primary key
    const k = normalizeNameKey(r.name);
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);

    // Secondary key — strip trailing "coaster" / "roller coaster" / "ride"
    const k2 = normalizeNameKey(stripRideSuffix(r.name));
    if (k2 !== k) {
      const list2 = map.get(k2) ?? [];
      list2.push(r);
      map.set(k2, list2);
    }
  }
  return map;
}

/** Haversine distance in km between two lat/lon points. */
function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Find the nearest DB park within maxKm, or undefined. */
function nearestPark(
  lat: number,
  lon: number,
  parks: DbPark[],
  maxKm = 2,
): DbPark | undefined {
  let best: DbPark | undefined;
  let bestDist = maxKm;
  for (const p of parks) {
    if (p.latitude == null || p.longitude == null) continue;
    const d = haversineKm(lat, lon, p.latitude, p.longitude);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/** Last parenthetical in an article title, e.g. "Big Dipper (Blackpool Pleasure Beach)". */
function extractTitleDisambiguator(title: string | null): string | null {
  if (!title) return null;
  const m = /\(([^)]+)\)\s*$/.exec(title.trim());
  return m ? m[1].trim() : null;
}

function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pickBestMatch(
  candidates: DbCoaster[],
  wd: WikidataCoasterRow,
): DbCoaster {
  if (candidates.length === 1) return candidates[0];

  const disambig =
    extractTitleDisambiguator(wd.enwikiTitle) ?? extractTitleDisambiguator(wd.label);
  const wdPark = wd.parkLabel ?? "";
  const wdCountry = (wd.countryLabel ?? "").toLowerCase();
  const wdLat = wd.latitude;
  const wdLon = wd.longitude;

  let best = candidates[0];
  let bestScore = -Infinity;

  for (const c of candidates) {
    const parkName = c.parks?.name ?? "";
    const country = (c.parks?.country ?? "").toLowerCase();
    let score = 0;

    if (disambig) {
      const disc = normalizeLoose(disambig);
      const pn = normalizeLoose(parkName);
      if (disc && pn && (pn.includes(disc) || disc.includes(pn))) score += 200;
    }

    if (wdPark && parkName) {
      const w = normalizeLoose(wdPark);
      const p = normalizeLoose(parkName);
      if (w && p && (p.includes(w) || w.includes(p))) score += 130;
    }

    if (wdCountry && (country.includes(wdCountry) || wdCountry.includes(country))) {
      score += 80;
    }

    const plat = c.parks?.latitude;
    const plon = c.parks?.longitude;
    if (
      wdLat != null &&
      wdLon != null &&
      plat != null &&
      plon != null &&
      Number.isFinite(plat) &&
      Number.isFinite(plon)
    ) {
      const km = haversineKm(wdLat, wdLon, plat, plon);
      score += Math.max(0, 100 - km * 15);
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
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
    .select("id, name, park_id, coaster_type, manufacturer, parks(name, country, latitude, longitude)");
  if (dbErr) {
    console.error("Supabase error:", dbErr.message);
    process.exit(1);
  }
  const coasters = (dbCoasters ?? []) as unknown as DbCoaster[];
  console.error(`  ${coasters.length} DB coasters loaded.`);

  const index = buildIndex(coasters);

  // Build update list; track unmatched entries for potential inserts
  const updates: CoasterUpdate[] = [];
  const unmatched: WikidataCoasterRow[] = [];
  for (const wd of wdRows) {
    const candidates = lookupCandidates(index, wd);
    if (!candidates?.length) {
      unmatched.push(wd);
      continue;
    }

    const match = pickBestMatch(candidates, wd);

    const update: CoasterUpdate = {
      id: match.id,
      wikidata_id: wd.wikidataId,
      // Only write numeric fields when Wikidata actually has a value —
      // never overwrite an existing DB value with null.
      length_ft: wd.lengthFt != null ? Math.round(wd.lengthFt) : null,
      speed_mph: wd.speedMph != null ? Math.round(wd.speedMph) : null,
      height_ft: wd.heightFt != null ? Math.round(wd.heightFt) : null,
      inversions: wd.inversions ?? undefined,
      duration_s:
        wd.durationS != null ? Math.round(wd.durationS) : undefined,
      opening_year: yearFromDate(wd.openingDate) ?? undefined,
      closing_year:
        (yearFromDate(wd.demolishedDate) ?? yearFromDate(wd.retirementDate)) ?? undefined,
    };

    // Only override status when Wikidata has a confident signal
    if (wd.status === "defunct") update.status = "Defunct";

    // Only fill manufacturer when the DB row has none
    const dbManufacturer = match.manufacturer ?? null;
    if (!dbManufacturer && wd.manufacturerLabel) {
      update.manufacturer = wd.manufacturerLabel;
    }

    // Fill coaster_type when DB has "Unknown" (or null)
    const inferredType = inferCoasterType(wd.coasterTypeLabel, wd.manufacturerLabel);
    if (inferredType && (!match.coaster_type || match.coaster_type === "Unknown")) {
      update.coaster_type = inferredType;
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
    console.error(`--dry-run: would update ${deduped.length} coasters (sample below).`);
    console.log(JSON.stringify(deduped.slice(0, 3), null, 2));
  }

  let updated = 0;
  if (!DRY_RUN) {
    // Batch updates in chunks of 200
    const CHUNK = 200;
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

  // -------------------------------------------------------------------------
  // Insert new coasters from Wikidata whose park already exists in the DB
  // -------------------------------------------------------------------------
  console.error(`\nChecking ${unmatched.length} unmatched Wikidata entries for insertable new rides...`);

  const { data: dbParks, error: parksErr } = await supabase
    .from("parks")
    .select("id, name, country, latitude, longitude");
  if (parksErr) {
    console.error("Could not load parks:", parksErr.message);
    return;
  }

  const allDbParks = (dbParks ?? []) as DbPark[];

  // Index parks by normalised name for fast exact-match lookup
  const parkByName = new Map<string, DbPark>();
  for (const p of allDbParks) {
    parkByName.set(p.name.toLowerCase().trim(), p);
  }

  // Build a set of "park_id:normalised_name" keys for every existing coaster
  // so we can skip Wikidata entries that are effectively already in the DB
  // under a slightly different raw name (the main update loop would have caught
  // them if the names were close enough).
  const existingKeys = new Set<string>();
  for (const c of coasters) {
    existingKeys.add(`${c.park_id}:${normalizeNameKey(c.name)}`);
  }

  type CoasterInsert = {
    park_id: number;
    name: string;
    wikidata_id: string;
    status: string;
    coaster_type: string;
    length_ft: number | null;
    speed_mph: number | null;
    height_ft: number | null;
    inversions: number | null;
    duration_s: number | null;
    opening_year: number | null;
    closing_year: number | null;
    manufacturer: string | null;
    external_source: string;
    last_synced_at: string;
  };

  const inserts: CoasterInsert[] = [];
  for (const wd of unmatched) {
    if (!wd.parkLabel) continue;

    // Primary: exact park name match
    let park = parkByName.get(wd.parkLabel.toLowerCase().trim());

    // Fallback: nearest DB park by coordinates (handles sub-area names like
    // "Marvel Super Hero Island" → "Islands of Adventure")
    if (!park && wd.latitude != null && wd.longitude != null) {
      park = nearestPark(wd.latitude, wd.longitude, allDbParks);
    }

    if (!park) continue; // park not in our DB — skip

    const insertName = wikidataInsertName(wd);
    const nameKey = normalizeNameKey(insertName);
    if (existingKeys.has(`${park.id}:${nameKey}`)) continue; // already exists

    inserts.push({
      park_id: park.id,
      name: insertName,
      wikidata_id: wd.wikidataId,
      status: wd.status === "defunct" ? "Defunct" : "Operating",
      coaster_type: inferCoasterType(wd.coasterTypeLabel, wd.manufacturerLabel) ?? "Unknown",
      length_ft: wd.lengthFt != null ? Math.round(wd.lengthFt) : null,
      speed_mph: wd.speedMph != null ? Math.round(wd.speedMph) : null,
      height_ft: wd.heightFt != null ? Math.round(wd.heightFt) : null,
      inversions: wd.inversions,
      duration_s: wd.durationS != null ? Math.round(wd.durationS) : null,
      opening_year: yearFromDate(wd.openingDate),
      closing_year: yearFromDate(wd.demolishedDate) ?? yearFromDate(wd.retirementDate),
      manufacturer: wd.manufacturerLabel ?? null,
      external_source: "wikidata",
      last_synced_at: new Date().toISOString(),
    });
  }

  console.error(`  ${inserts.length} new coasters to insert (park matched, not yet in DB).`);

  if (DRY_RUN) {
    console.error(`--dry-run: would insert ${inserts.length} new coasters (sample below).`);
    console.log(JSON.stringify(inserts.slice(0, 5), null, 2));
    return;
  }

  let inserted = 0;
  let upserted = 0;
  for (const row of inserts) {
    const { error } = await supabase
      .from("coasters")
      .upsert(row, { onConflict: "park_id,name", ignoreDuplicates: false });
    if (error) {
      console.error(`  Upsert failed for "${row.name}" (park_id=${row.park_id}): ${error.message}`);
    } else {
      upserted += 1;
    }
  }
  // Count true inserts vs updates is hard to distinguish with upsert, so report total upserts.
  console.error(`Done. Upserted ${upserted} coasters from Wikidata (new inserts + enrichment updates for name-mismatched rides).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
