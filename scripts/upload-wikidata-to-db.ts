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
import { sanitizeCoasterImageUrl } from "../src/lib/coaster-known-fixes";
import { normalizeCoasterDedupKey } from "../src/lib/coaster-dedup";
import { reconcileCountryWithCoords } from "../src/lib/geo-country";
import { haversineKm } from "../src/lib/geo";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import { isLikelyWaterParkName, parkNamesMatch } from "../src/lib/park-match";
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
const STRICT_INCIDENT_TITLES = process.argv.includes("--strict-incidents");

const supabase = createServiceRoleClient();

const INCIDENT_TITLE_RE =
  /\b(disaster|accident|incident|derailment|collision|crash|fire|explosion|fatal)\b/i;
// Keep upload preflight behavior aligned with validate-wikidata-coasters.
const INCIDENT_TITLE_QID_ALLOWLIST = new Set(["Q22000267"]);

// ---------------------------------------------------------------------------
// DB types
// ---------------------------------------------------------------------------

type DbCoaster = {
  id: number;
  name: string;
  park_id: number;
  wikidata_id: string | null;
  external_source: string | null;
  external_id: string | null;
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
  external_source: string | null;
  external_id: string | null;
};

type CoasterUpdate = {
  id: number;
  name: string;
  wikidata_id: string;
  external_source: "wikidata";
  external_id: string;
  last_synced_at: string;
  length_ft?: number;
  speed_mph?: number;
  height_ft?: number;
  inversions?: number;       // omit rather than null — never wipe existing value
  duration_s?: number;
  opening_year?: number;
  closing_year?: number;
  status?: string;
  manufacturer?: string;
  coaster_type?: string;
  image_url?: string | null;
};

/**
 * Sent to Supabase — omit `name` when skipping rename; omit Wikidata binding fields when
 * another row already holds the same (park_id, name) or (park_id, wikidata Q-id).
 */
type PreparedCoasterUpdate = Omit<
  CoasterUpdate,
  "name" | "wikidata_id" | "external_source" | "external_id"
> & {
  name?: string;
  wikidata_id?: string;
  external_source?: "wikidata";
  external_id?: string;
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
  parkByExternalQid: Map<string, DbPark>,
  allDbParks: DbPark[],
  opts?: { allowWaterParks?: boolean },
): DbPark | undefined {
  const allowWaterParks = opts?.allowWaterParks ?? false;
  const parkQid = wd.parkWikidataId?.trim().toUpperCase();
  if (parkQid) {
    const byQid = parkByExternalQid.get(parkQid);
    if (byQid && (allowWaterParks || !isLikelyWaterParkName(byQid.name))) return byQid;
  }

  const label = wd.parkLabel?.trim();
  if (!label) return undefined;

  const direct = parkByName.get(label.toLowerCase());
  if (direct && (allowWaterParks || !isLikelyWaterParkName(direct.name))) return direct;

  const matches = allDbParks.filter((p) => {
    if (!parkNamesMatch(label, p.name)) return false;
    if (!allowWaterParks && isLikelyWaterParkName(p.name)) return false;
    return true;
  });
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
  // Ambiguous fuzzy matches (e.g. "Six Flags ...") should not snap to the first row.
  // Let caller fall back to coordinate-based matching or create a new park row instead.
  return undefined;
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
  opts?: { requireCountryLabel?: string | null; allowWaterParks?: boolean },
): DbPark | undefined {
  const allowWaterParks = opts?.allowWaterParks ?? false;
  let best: DbPark | undefined;
  let bestDist = maxKm;
  for (const p of parks) {
    if (p.latitude == null || p.longitude == null) continue;
    if (!allowWaterParks && isLikelyWaterParkName(p.name)) continue;
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

/** Some Wikidata fallback rows use bare entity IDs as labels (e.g. "Q2446903"). */
function isPlaceholderQidLabel(label: string | null | undefined): boolean {
  const t = (label ?? "").trim();
  return /^Q\d+$/i.test(t);
}

function pickBestMatch(
  candidates: DbCoaster[],
  wd: WikidataCoasterRow,
): DbCoaster | null {
  if (candidates.length === 1) return candidates[0];

  const disambig =
    extractTitleDisambiguator(wd.enwikiTitle) ?? extractTitleDisambiguator(wd.label);
  const wdPark = wd.parkLabel ?? "";
  const wdCountry = (wd.countryLabel ?? "").toLowerCase();
  const wdLat = wd.latitude;
  const wdLon = wd.longitude;
  const hasDisambiguationSignals =
    Boolean(disambig?.trim()) ||
    Boolean(wdPark.trim()) ||
    Boolean(wdCountry.trim()) ||
    (wdLat != null && wdLon != null);

  if (!hasDisambiguationSignals) return null;

  let best = candidates[0];
  let bestScore = -Infinity;
  let secondBestScore = -Infinity;

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
      secondBestScore = bestScore;
      bestScore = score;
      best = c;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  // If we cannot positively distinguish a winner, don't bind this Wikidata row.
  if (bestScore <= 0) return null;
  if (bestScore - secondBestScore < 40 && !disambig && !wdPark.trim()) return null;

  return best;
}

/**
 * When Wikidata names a park we do not have yet (e.g. new gate), create a `parks` row from
 * label + coordinates — same idea as `syncCatalogFromWikidata`, so `upload-wikidata-to-db`
 * is not blocked on a separate full catalog sync.
 */
async function insertParkFromWikidataRow(wd: WikidataCoasterRow): Promise<DbPark | null> {
  const label = wd.parkLabel?.trim();
  if (!label) return null;
  if (
    wd.latitude == null ||
    wd.longitude == null ||
    !Number.isFinite(wd.latitude) ||
    !Number.isFinite(wd.longitude)
  ) {
    return null;
  }
  const country = reconcileCountryWithCoords(
    wd.countryLabel ?? null,
    wd.latitude,
    wd.longitude,
  );
  const { data, error } = await supabase
    .from("parks")
    .insert({
      name: label,
      country,
      latitude: wd.latitude,
      longitude: wd.longitude,
      external_source: "wikidata",
      external_id: wd.parkWikidataId,
      last_synced_at: new Date().toISOString(),
    })
    .select("id, name, country, latitude, longitude, external_source, external_id")
    .single();
  if (error) {
    console.error(`  Could not create park "${label}": ${error.message}`);
    return null;
  }
  console.error(`  Created missing park row: "${label}" (id=${data.id})`);
  return data as DbPark;
}

function unknownParkExternalIdForRow(wd: WikidataCoasterRow): string | null {
  if (
    wd.latitude == null ||
    wd.longitude == null ||
    !Number.isFinite(wd.latitude) ||
    !Number.isFinite(wd.longitude)
  ) {
    return null;
  }
  const country = reconcileCountryWithCoords(wd.countryLabel ?? null, wd.latitude, wd.longitude);
  const countrySlug = country.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `unknown-park:${countrySlug || "unknown"}:${wd.latitude.toFixed(4)}:${wd.longitude.toFixed(4)}`;
}

async function insertUnknownParkFromWikidataRow(wd: WikidataCoasterRow): Promise<DbPark | null> {
  const ext = unknownParkExternalIdForRow(wd);
  if (!ext || wd.latitude == null || wd.longitude == null) return null;
  const country = reconcileCountryWithCoords(wd.countryLabel ?? null, wd.latitude, wd.longitude);
  const name =
    country && country !== "Unknown"
      ? `Unknown / historical park (${country})`
      : "Unknown / historical park";
  const { data, error } = await supabase
    .from("parks")
    .insert({
      name,
      country,
      latitude: wd.latitude,
      longitude: wd.longitude,
      external_source: "wikidata_unknown_park",
      external_id: ext,
      last_synced_at: new Date().toISOString(),
    })
    .select("id, name, country, latitude, longitude, external_source, external_id")
    .single();
  if (error) {
    console.error(`  Could not create fallback unknown park "${name}": ${error.message}`);
    return null;
  }
  console.error(`  Created fallback park row: "${name}" (id=${data.id})`);
  return data as DbPark;
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

const exactNameKey = (parkId: number, name: string) => `${parkId}\0${name}`;

/**
 * Postgres unique (park_id, name) uses the **exact** name string. Normalized collision
 * checks can miss cases where two titles normalize the same but differ in punctuation.
 */
function resolveExactParkNameCollisions(
  updates: PreparedCoasterUpdate[],
  coasters: DbCoaster[],
): PreparedCoasterUpdate[] {
  const byId = new Map(coasters.map((c) => [c.id, c]));
  const owner = new Map<string, number>();
  for (const c of coasters) {
    owner.set(exactNameKey(c.park_id, c.name), c.id);
  }

  const sorted = [...updates].sort((a, b) => a.id - b.id);
  const out: PreparedCoasterUpdate[] = [];

  for (const u of sorted) {
    if (u.name === undefined) {
      out.push(u);
      continue;
    }
    const row = byId.get(u.id);
    if (!row) {
      out.push(u);
      continue;
    }

    const oldKey = exactNameKey(row.park_id, row.name);
    const newKey = exactNameKey(row.park_id, u.name);
    const holder = owner.get(newKey);
    if (holder !== undefined && holder !== u.id) {
      const { name: _drop, ...rest } = u;
      out.push(rest);
      console.error(
        `  Skipping exact-name rename for id=${u.id}: "${u.name}" already used at this park (coaster id=${holder}).`,
      );
      continue;
    }

    if (owner.get(oldKey) === u.id) owner.delete(oldKey);
    owner.set(newKey, u.id);
    out.push(u);
  }

  return out;
}

function buildWikidataHolderMap(coasters: DbCoaster[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of coasters) {
    const q = c.wikidata_id?.trim();
    if (q) {
      const k = q.toUpperCase();
      if (!m.has(k)) m.set(k, c.id);
    }
    if (c.external_source === "wikidata" && c.external_id?.trim()) {
      const k = c.external_id.trim().toUpperCase();
      if (!m.has(k)) m.set(k, c.id);
    }
  }
  return m;
}

/**
 * A Wikidata Q-id should identify one coaster globally. Keep at most one DB row
 * bound to each Q-id, even if duplicate rows exist under different parks/sources.
 */
function resolveWikidataExternalCollisions(
  updates: PreparedCoasterUpdate[],
  coasters: DbCoaster[],
): PreparedCoasterUpdate[] {
  const byId = new Map(coasters.map((c) => [c.id, c]));
  const holder = buildWikidataHolderMap(coasters);
  const sorted = [...updates].sort((a, b) => a.id - b.id);
  const out: PreparedCoasterUpdate[] = [];

  for (const u of sorted) {
    const row = byId.get(u.id);
    if (!row) {
      out.push(u);
      continue;
    }

    const qNew = (u.wikidata_id ?? u.external_id ?? "").trim().toUpperCase();
    if (!qNew) {
      out.push(u);
      continue;
    }

    const key = qNew;
    const existing = holder.get(key);
    if (existing !== undefined && existing !== u.id) {
      const {
        wikidata_id: _w,
        external_source: _es,
        external_id: _e,
        ...rest
      } = u;
      out.push(rest);
      console.error(
        `  Skipping Wikidata binding for id=${u.id}: Q-id already linked to coaster id=${existing}.`,
      );
      continue;
    }

    const prevQ = row.wikidata_id?.trim();
    if (prevQ && prevQ.toUpperCase() !== qNew) {
      const prevKey = prevQ.toUpperCase();
      if (holder.get(prevKey) === u.id) holder.delete(prevKey);
    }
    if (row.external_source === "wikidata" && row.external_id?.trim()) {
      const pe = row.external_id.trim().toUpperCase();
      if (pe !== qNew) {
        const pk = pe;
        if (holder.get(pk) === u.id) holder.delete(pk);
      }
    }

    holder.set(key, u.id);
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

  // Preflight: protect against poisoned input payloads.
  const seenQids = new Set<string>();
  const duplicateQids = new Set<string>();
  const suspiciousIncidentTitles: string[] = [];
  for (const row of wdRows) {
    const qid = row.wikidataId.trim().toUpperCase();
    if (seenQids.has(qid)) duplicateQids.add(qid);
    seenQids.add(qid);
    const title = (row.enwikiTitle ?? "").trim();
    if (
      title &&
      INCIDENT_TITLE_RE.test(title) &&
      !INCIDENT_TITLE_QID_ALLOWLIST.has(qid) &&
      !INCIDENT_TITLE_RE.test(row.label)
    ) {
      suspiciousIncidentTitles.push(`${qid} :: ${row.label} :: ${title}`);
    }
  }
  if (duplicateQids.size > 0) {
    throw new Error(
      `Input contains duplicate Wikidata IDs (${duplicateQids.size}). Example: ${[
        ...duplicateQids,
      ]
        .slice(0, 10)
        .join(", ")}`,
    );
  }
  if (suspiciousIncidentTitles.length > 0) {
    const message =
      `Input contains suspicious incident/disaster enwiki titles (${suspiciousIncidentTitles.length}). Example: ${suspiciousIncidentTitles
        .slice(0, 5)
        .join(" | ")}`;
    if (STRICT_INCIDENT_TITLES) {
      throw new Error(message);
    }
    console.error(`WARNING: ${message}`);
    console.error("Continuing upload (non-blocking by default). Use --strict-incidents to fail.");
  }

  // Load all coasters from the DB, including park name/country for matching
  console.error("Loading coasters from Supabase...");
  const { data: dbCoasters, error: dbErr } = await fetchAllPages<DbCoaster>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select(
          "id, name, park_id, wikidata_id, external_source, external_id, coaster_type, manufacturer, parks(name, country, latitude, longitude)",
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
    if (!match) {
      unmatched.push(wd);
      continue;
    }

    const displayName = wikidataInsertName(wd);
    const update: CoasterUpdate = {
      id: match.id,
      name: displayName,
      wikidata_id: wd.wikidataId,
      external_source: "wikidata",
      external_id: wd.wikidataId,
      last_synced_at: new Date().toISOString(),
      // Only write numeric fields when Wikidata actually has a value.
      // Omitting fields preserves existing DB values.
      length_ft: wd.lengthFt != null ? Math.round(wd.lengthFt) : undefined,
      speed_mph: wd.speedMph != null ? Math.round(wd.speedMph) : undefined,
      height_ft: wd.heightFt != null ? Math.round(wd.heightFt) : undefined,
      inversions: wd.inversions ?? undefined,
      duration_s:
        wd.durationS != null ? Math.round(wd.durationS) : undefined,
      opening_year: yearFromDate(wd.openingDate) ?? undefined,
      closing_year:
        (yearFromDate(wd.demolishedDate) ?? yearFromDate(wd.retirementDate)) ?? undefined,
      image_url:
        wd.imageUrl == null || wd.imageUrl === ""
          ? undefined
          : (sanitizeCoasterImageUrl(wd.imageUrl) ?? null),
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

  let prepared = resolveParkNameCollisions(deduped, coasters);
  prepared = resolveExactParkNameCollisions(prepared, coasters);
  prepared = resolveWikidataExternalCollisions(prepared, coasters);

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
  // Insert new coasters from Wikidata (create missing `parks` rows when WD has label + coords)
  // -------------------------------------------------------------------------
  console.error(`\nChecking ${unmatched.length} unmatched Wikidata entries for insertable new rides...`);

  const { data: dbParks, error: parksErr } = await fetchAllPages<DbPark>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("parks")
        .select("id, name, country, latitude, longitude, external_source, external_id")
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
  const parkByExternalQid = new Map<string, DbPark>();
  for (const p of allDbParks) {
    parkByName.set(p.name.toLowerCase().trim(), p);
    if (p.external_source === "wikidata" && p.external_id) {
      parkByExternalQid.set(p.external_id.trim().toUpperCase(), p);
    }
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
    image_url: string | null;
    external_source: "wikidata";
    external_id: string;
    last_synced_at: string;
  };

  const inserts: CoasterInsert[] = [];
  for (const wd of unmatched) {
    const allowWaterParkMatch = isLikelyWaterParkName(wd.parkLabel ?? "");
    const hasCoords = wd.latitude != null && wd.longitude != null;
    // Skip unhelpful placeholder labels ("Q12345"), but still allow coordinate-only rows
    // to attach to nearby parks when the label is a real ride title (e.g. Anaconda, Gold Reef City).
    if (isPlaceholderQidLabel(wd.label)) continue;
    if (!wd.parkLabel && !hasCoords) continue;

    // Primary: exact name index, else fuzzy park name match (no per-resort hardcoding)
    let park = findParkForWikidataInsert(wd, parkByName, parkByExternalQid, allDbParks, {
      allowWaterParks: allowWaterParkMatch,
    });

    // Fallback: nearest DB park by coordinates (tight radius first)
    if (!park && wd.latitude != null && wd.longitude != null) {
      park = nearestPark(wd.latitude, wd.longitude, allDbParks, 2, {
        allowWaterParks: allowWaterParkMatch,
      });
    }
    // Large resorts / name mismatches: same country only (e.g. Qiddiya vs "Six Flags Qiddiya City")
    if (!park && wd.latitude != null && wd.longitude != null) {
      park = nearestPark(wd.latitude, wd.longitude, allDbParks, 35, {
        requireCountryLabel: wd.countryLabel ?? null,
        allowWaterParks: allowWaterParkMatch,
      });
    }

    if (!park && !DRY_RUN) {
      const created = await insertParkFromWikidataRow(wd);
      if (created) {
        allDbParks.push(created);
        parkByName.set(created.name.toLowerCase().trim(), created);
        if (created.external_source === "wikidata" && created.external_id) {
          parkByExternalQid.set(created.external_id.trim().toUpperCase(), created);
        }
        park = created;
      }
    }

    if (!park) {
      const unknownExt = unknownParkExternalIdForRow(wd);
      if (unknownExt) {
        park = allDbParks.find(
          (p) => p.external_source === "wikidata_unknown_park" && p.external_id === unknownExt,
        );
      }
    }

    if (!park && !DRY_RUN) {
      const createdUnknown = await insertUnknownParkFromWikidataRow(wd);
      if (createdUnknown) {
        allDbParks.push(createdUnknown);
        park = createdUnknown;
      }
    }

    if (!park) continue;

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
      image_url: sanitizeCoasterImageUrl(wd.imageUrl ?? null),
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
