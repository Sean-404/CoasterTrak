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
import { arg, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import { normalizeCoasterDedupKey } from "../src/lib/coaster-dedup";
import { reconcileCountryWithCoords } from "../src/lib/geo-country";
import { haversineKm } from "../src/lib/geo";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import { parkNamesMatch } from "../src/lib/park-match";
import { normalizeNameKey, type WikidataCoasterRow } from "../src/lib/wikidata-coasters";
import {
  inferCoasterType,
  wikidataInsertName,
  yearFromDate,
} from "../src/lib/wikidata-coaster-inference";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createServiceRoleClient();

// ---------------------------------------------------------------------------
// DB types
// ---------------------------------------------------------------------------

type DbCoaster = {
  id: number;
  name: string;
  park_id: number;
  wikidata_id: string | null;
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
  name: string;
  wikidata_id: string;
  external_source: "wikidata";
  external_id: string;
  last_synced_at: string;
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

/** Update row sent to Supabase — `name` omitted when we skip a rename to satisfy unique (park_id, name). */
type PreparedCoasterUpdate = Omit<CoasterUpdate, "name"> & { name?: string };

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

/** Former Queue-Times / DB titles that never matched Wikidata after a park rename. */
const WIKIDATA_LEGACY_DB_NAMES: Record<string, string[]> = {
  Q885702: ["Zipper Dipper"],
};

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
    normalizeCoasterDedupKey(wd.label),
    normalizeCoasterDedupKey(stripRideSuffix(wd.label)),
  ];
  if (wd.enwikiTitle) {
    keys.push(
      normalizeNameKey(wd.enwikiTitle),
      normalizeNameKey(stripRideSuffix(wd.enwikiTitle)),
      normalizeCoasterDedupKey(wd.enwikiTitle),
      normalizeCoasterDedupKey(stripRideSuffix(wd.enwikiTitle)),
    );
  }
  const qid = wd.wikidataId?.trim().toUpperCase();
  const legacy = qid ? WIKIDATA_LEGACY_DB_NAMES[qid] : undefined;
  if (legacy) {
    for (const alt of legacy) {
      keys.push(
        normalizeNameKey(alt),
        normalizeNameKey(stripRideSuffix(alt)),
        normalizeCoasterDedupKey(alt),
        normalizeCoasterDedupKey(stripRideSuffix(alt)),
      );
    }
  }
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = index.get(key);
    if (c?.length) return c;
  }
  return undefined;
}

function buildIndex(rows: DbCoaster[]): Map<string, DbCoaster[]> {
  const map = new Map<string, DbCoaster[]>();
  const add = (key: string, r: DbCoaster) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  };
  for (const r of rows) {
    const k = normalizeNameKey(r.name);
    add(k, r);

    const k2 = normalizeNameKey(stripRideSuffix(r.name));
    if (k2 !== k) add(k2, r);

    // Same collapsing as map UI: "The Big One" vs "Big One", stylized spellings, etc.
    const k3 = normalizeCoasterDedupKey(r.name);
    if (k3 && k3 !== k && k3 !== k2) add(k3, r);
  }
  return map;
}

/**
 * Resolve Wikidata `parkLabel` to a DB park row: exact name index first, then
 * `parkNamesMatch` (substring / token overlap — same idea as `wikidata-catalog-sync`).
 * Multiple fuzzy hits: prefer closest coordinates + country alignment.
 */
function findParkForWikidataInsert(
  wd: WikidataCoasterRow,
  parkByName: Map<string, DbPark>,
  allDbParks: DbPark[],
): DbPark | undefined {
  const label = wd.parkLabel?.trim();
  if (!label) return undefined;

  const direct = parkByName.get(label.toLowerCase());
  if (direct) return direct;

  const matches = allDbParks.filter((p) => parkNamesMatch(label, p.name));
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  const lat = wd.latitude ?? null;
  const lon = wd.longitude ?? null;
  const countryHint = wd.countryLabel;

  if (lat != null && lon != null) {
    let best: DbPark | undefined;
    let bestD = Infinity;
    for (const p of matches) {
      if (p.latitude == null || p.longitude == null) continue;
      if (!countryAlignedWithWikidata(countryHint, p)) continue;
      const d = haversineKm(lat, lon, p.latitude, p.longitude);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best != null) return best;
  }

  for (const p of matches) {
    if (countryAlignedWithWikidata(countryHint, p)) return p;
  }
  return matches[0];
}

function countryAlignedWithWikidata(
  wdCountry: string | null | undefined,
  park: DbPark,
): boolean {
  if (!wdCountry?.trim()) return true;
  const w = wdCountry.trim().toLowerCase();
  const resolved = reconcileCountryWithCoords(park.country, park.latitude, park.longitude)
    .trim()
    .toLowerCase();
  if (!resolved || resolved === "unknown") return true;
  return w === resolved || w.includes(resolved) || resolved.includes(w);
}

/**
 * Nearest DB park within maxKm. When `requireCountryLabel` is set, only parks whose
 * reconciled country matches the Wikidata ride (avoids snapping to a wrong resort in dense regions).
 */
function nearestPark(
  lat: number,
  lon: number,
  parks: DbPark[],
  maxKm: number,
  opts?: { requireCountryLabel?: string | null },
): DbPark | undefined {
  let best: DbPark | undefined;
  let bestDist = maxKm;
  for (const p of parks) {
    if (p.latitude == null || p.longitude == null) continue;
    if (opts?.requireCountryLabel != null && opts.requireCountryLabel !== "") {
      if (!countryAlignedWithWikidata(opts.requireCountryLabel, p)) continue;
    }
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

/**
 * Wikidata cleanup can make two different DB rows want the same display name at one park.
 * The DB enforces unique (park_id, name). Drop `name` from conflicting updates so enrichment
 * fields still apply without violating the constraint.
 */
function resolveParkNameCollisions(
  updates: CoasterUpdate[],
  coasters: DbCoaster[],
): PreparedCoasterUpdate[] {
  const byId = new Map(coasters.map((c) => [c.id, c]));
  const occ = new Map<string, number>();
  for (const c of coasters) {
    occ.set(`${c.park_id}:${normalizeNameKey(c.name)}`, c.id);
  }

  const sorted = [...updates].sort((a, b) => a.id - b.id);
  const out: PreparedCoasterUpdate[] = [];

  for (const u of sorted) {
    const row = byId.get(u.id);
    if (!row) {
      out.push(u);
      continue;
    }
    const parkId = row.park_id;
    const nkOld = normalizeNameKey(row.name);
    const nkNew = normalizeNameKey(u.name);
    if (nkOld === nkNew) {
      out.push(u);
      continue;
    }

    const oldKey = `${parkId}:${nkOld}`;
    const newKey = `${parkId}:${nkNew}`;
    const holder = occ.get(newKey);
    if (holder !== undefined && holder !== u.id) {
      const { name: _drop, ...rest } = u;
      out.push(rest);
      console.error(
        `  Skipping rename for id=${u.id}: "${u.name}" already used at this park (coaster id=${holder}).`,
      );
      continue;
    }

    if (occ.get(oldKey) === u.id) occ.delete(oldKey);
    occ.set(newKey, u.id);
    out.push(u);
  }

  return out;
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
  const { data: dbCoasters, error: dbErr } = await fetchAllPages<DbCoaster>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select(
          "id, name, park_id, wikidata_id, coaster_type, manufacturer, parks(name, country, latitude, longitude)",
        )
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (dbErr) {
    console.error("Supabase error:", dbErr.message);
    process.exit(1);
  }
  const coasters = dbCoasters;
  console.error(`  ${coasters.length} DB coasters loaded.`);

  const index = buildIndex(coasters);

  const byWikidataId = new Map<string, DbCoaster>();
  for (const c of coasters) {
    if (c.wikidata_id) byWikidataId.set(c.wikidata_id, c);
  }

  // Build update list; track unmatched entries for potential inserts
  const updates: CoasterUpdate[] = [];
  const unmatched: WikidataCoasterRow[] = [];
  for (const wd of wdRows) {
    let candidates = lookupCandidates(index, wd);
    if (!candidates?.length && wd.wikidataId) {
      const byId = byWikidataId.get(wd.wikidataId);
      if (byId) candidates = [byId];
    }
    if (!candidates?.length) {
      unmatched.push(wd);
      continue;
    }

    const match = pickBestMatch(candidates, wd);

    const displayName = wikidataInsertName(wd);
    const update: CoasterUpdate = {
      id: match.id,
      name: displayName,
      wikidata_id: wd.wikidataId,
      external_source: "wikidata",
      external_id: wd.wikidataId,
      last_synced_at: new Date().toISOString(),
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

  const prepared = resolveParkNameCollisions(deduped, coasters);

  console.error(
    `Matched ${deduped.length} / ${wdRows.length} Wikidata entries to DB coasters.`,
  );

  if (DRY_RUN) {
    console.error(`--dry-run: would update ${prepared.length} coasters (sample below).`);
    console.log(JSON.stringify(prepared.slice(0, 3), null, 2));
  }

  let updated = 0;
  if (!DRY_RUN) {
    // Batch updates in chunks of 200
    const CHUNK = 200;
    for (let i = 0; i < prepared.length; i += CHUNK) {
      const chunk = prepared.slice(i, i + CHUNK);
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
      console.error(`  ${Math.min(i + CHUNK, prepared.length)} / ${prepared.length} updated...`);
    }
    console.error(`Done. Updated ${updated} coasters in Supabase.`);
  }

  // -------------------------------------------------------------------------
  // Insert new coasters from Wikidata whose park already exists in the DB
  // -------------------------------------------------------------------------
  console.error(`\nChecking ${unmatched.length} unmatched Wikidata entries for insertable new rides...`);

  const { data: dbParks, error: parksErr } = await fetchAllPages<DbPark>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("parks")
        .select("id, name, country, latitude, longitude")
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (parksErr) {
    console.error("Could not load parks:", parksErr.message);
    return;
  }

  const allDbParks = dbParks;

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
    external_source: "wikidata";
    external_id: string;
    last_synced_at: string;
  };

  const inserts: CoasterInsert[] = [];
  for (const wd of unmatched) {
    if (!wd.parkLabel) continue;

    // Primary: exact name index, else fuzzy park name match (no per-resort hardcoding)
    let park = findParkForWikidataInsert(wd, parkByName, allDbParks);

    // Fallback: nearest DB park by coordinates (tight radius first)
    if (!park && wd.latitude != null && wd.longitude != null) {
      park = nearestPark(wd.latitude, wd.longitude, allDbParks, 2);
    }
    // Large resorts / name mismatches: same country only (e.g. Qiddiya vs "Six Flags Qiddiya City")
    if (!park && wd.latitude != null && wd.longitude != null) {
      park = nearestPark(wd.latitude, wd.longitude, allDbParks, 35, {
        requireCountryLabel: wd.countryLabel ?? null,
      });
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
      external_id: wd.wikidataId,
      last_synced_at: new Date().toISOString(),
    });
  }

  console.error(`  ${inserts.length} new coasters to insert (park matched, not yet in DB).`);

  if (DRY_RUN) {
    console.error(`--dry-run: would insert ${inserts.length} new coasters (sample below).`);
    console.log(JSON.stringify(inserts.slice(0, 5), null, 2));
    return;
  }

  let appliedNewRides = 0;
  if (inserts.length > 0) {
    // PostgREST upsert(onConflict: park_id,external_source,external_id) fails when Postgres
    // cannot match ON CONFLICT to the partial unique index (migration 004). Avoid upsert:
    // prefetch existing Wikidata-linked rows and insert or update by primary key.
    const parkIds = [...new Set(inserts.map((r) => r.park_id))];
    const { data: existingRows, error: loadExistingErr } = await fetchAllPages<{
      id: number;
      park_id: number;
      external_id: string | null;
    }>(SUPABASE_PAGE_SIZE, (from, to) =>
      supabase
        .from("coasters")
        .select("id, park_id, external_id")
        .eq("external_source", "wikidata")
        .in("park_id", parkIds)
        .order("id", { ascending: true })
        .range(from, to),
    );

    if (loadExistingErr) {
      console.error("Could not load existing Wikidata coasters:", loadExistingErr.message);
    } else {
      const idByParkExternal = new Map<string, number>();
      for (const r of existingRows ?? []) {
        const ext = r.external_id as string | null;
        if (ext) idByParkExternal.set(`${r.park_id}:${ext}`, Number(r.id));
      }

      const toInsert: CoasterInsert[] = [];
      const toUpdate: { id: number; row: CoasterInsert }[] = [];

      for (const row of inserts) {
        const key = `${row.park_id}:${row.external_id}`;
        const existingId = idByParkExternal.get(key);
        if (existingId != null) {
          toUpdate.push({ id: existingId, row });
        } else {
          toInsert.push(row);
        }
      }

      for (const { id, row } of toUpdate) {
        const { error } = await supabase.from("coasters").update(row).eq("id", id);
        if (error) {
          console.error(
            `  Update (new-ride path) failed for "${row.name}" (id=${id}): ${error.message}`,
          );
        } else {
          appliedNewRides += 1;
        }
      }

      const CHUNK = 100;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const { error } = await supabase.from("coasters").insert(chunk);
        if (!error) {
          appliedNewRides += chunk.length;
          continue;
        }
        console.error(
          `  Batch insert failed (${chunk.length} rows): ${error.message}; retrying one-by-one.`,
        );
        for (const row of chunk) {
          const { error: e2 } = await supabase.from("coasters").insert(row);
          if (e2) {
            console.error(`  Insert failed for "${row.name}" (park_id=${row.park_id}): ${e2.message}`);
          } else {
            appliedNewRides += 1;
          }
        }
      }
    }
  }

  console.error(
    `Done. Applied ${appliedNewRides} new-ride rows from Wikidata (insert or update by park + external id).`,
  );
}

runMain(main);
