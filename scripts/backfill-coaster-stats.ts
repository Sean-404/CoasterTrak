/**
 * Backfill missing coaster stats from local Wikidata JSON + legacy CSV.
 * Only fills NULL numeric fields; never overwrites existing values.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-coaster-stats.ts [--dry-run]
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "papaparse";
import { createServiceRoleClient } from "./lib/supabase-service";
import { normalizeNameKey, type WikidataCoasterRow } from "../src/lib/wikidata-coasters";
import { yearFromDate } from "../src/lib/wikidata-coaster-inference";

const DRY_RUN = process.argv.includes("--dry-run");
const supabase = createServiceRoleClient();

type DbRow = {
  id: number;
  name: string;
  park_id: number;
  wikidata_id: string | null;
  manufacturer: string | null;
  coaster_type: string | null;
  length_ft: number | null;
  speed_mph: number | null;
  height_ft: number | null;
  inversions: number | null;
  duration_s: number | null;
  opening_year: number | null;
  parks: { name: string } | null;
};

type Patch = {
  length_ft?: number;
  speed_mph?: number;
  height_ft?: number;
  inversions?: number;
  duration_s?: number;
  opening_year?: number;
  manufacturer?: string;
  coaster_type?: string;
};

function parseFeet(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const text = raw.replace(/,/g, "");
  const ft = /([\d.]+)\s*(?:ft|feet)\b/i.exec(text);
  if (ft) return Math.round(parseFloat(ft[1]!));
  const m = /([\d.]+)\s*m\b/i.exec(text);
  if (m) return Math.round(parseFloat(m[1]!) * 3.28084);
  const bare = parseFloat(text.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(bare) && bare > 0 && bare < 10000 ? Math.round(bare) : null;
}

function parseMph(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const text = raw.replace(/,/g, "");
  const mph = /([\d.]+)\s*mph\b/i.exec(text);
  if (mph) return Math.round(parseFloat(mph[1]!));
  const kmh = /([\d.]+)\s*km\/h\b/i.exec(text);
  if (kmh) return Math.round(parseFloat(kmh[1]!) / 1.60934);
  const bare = parseFloat(text.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(bare) && bare > 0 && bare < 200 ? Math.round(bare) : null;
}

function parseDurationSeconds(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const minSec = /([\d]+)\s*:\s*([\d]+)/.exec(raw);
  if (minSec) return parseInt(minSec[1]!, 10) * 60 + parseInt(minSec[2]!, 10);
  const mins = /([\d.]+)\s*min/i.exec(raw);
  if (mins) return Math.round(parseFloat(mins[1]!) * 60);
  return null;
}

function parseInversions(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = parseInt(raw.replace(/[^0-9\-]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 && n < 50 ? n : null;
}

function parkKey(name: string): string {
  return normalizeNameKey(name).replace(/[^a-z0-9]+/g, "");
}

/** Alphanumeric name key; strips parentheticals and trailing "coaster". */
function rideKey(name: string): string {
  return normalizeNameKey(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bcoaster\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

const PARK_ALIASES: Record<string, string[]> = {
  plopsalandbelgium: ["plopsalanddepanne", "plopsaland"],
  plopsalanddepanne: ["plopsalandbelgium", "plopsaland"],
  universalsstudiosjapan: ["universalstudiosjapan"],
  universalstudiosjapan: ["universalsstudiosjapan"],
};

function parksCompatible(dbPark: string, csvPark: string): boolean {
  const a = parkKey(dbPark);
  const b = parkKey(csvPark);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aliases = PARK_ALIASES[b] ?? [];
  return aliases.some((al) => a === al || a.includes(al) || al.includes(a));
}

function mergePatch(row: DbRow, patch: Patch): Patch | null {
  const out: Patch = {};
  if (row.length_ft == null && patch.length_ft != null) out.length_ft = patch.length_ft;
  if (row.speed_mph == null && patch.speed_mph != null) out.speed_mph = patch.speed_mph;
  if (row.height_ft == null && patch.height_ft != null) out.height_ft = patch.height_ft;
  if (row.inversions == null && patch.inversions != null) out.inversions = patch.inversions;
  if (row.duration_s == null && patch.duration_s != null) out.duration_s = patch.duration_s;
  if (row.opening_year == null && patch.opening_year != null) out.opening_year = patch.opening_year;
  if (!row.manufacturer?.trim() && patch.manufacturer) out.manufacturer = patch.manufacturer;
  if (
    (!row.coaster_type || row.coaster_type === "Unknown" || row.coaster_type === "Other") &&
    patch.coaster_type &&
    patch.coaster_type !== "Unknown"
  ) {
    out.coaster_type = patch.coaster_type;
  }
  return Object.keys(out).length ? out : null;
}

async function loadDbCoasters(): Promise<DbRow[]> {
  const rows: DbRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("coasters")
      .select(
        "id,name,park_id,wikidata_id,manufacturer,coaster_type,length_ft,speed_mph,height_ft,inversions,duration_s,opening_year,parks(name)",
      )
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const parks = Array.isArray(row.parks) ? row.parks[0] ?? null : row.parks;
      rows.push({ ...(row as Omit<DbRow, "parks">), parks: parks as { name: string } | null });
    }
    if (data.length < page) break;
  }
  return rows;
}

async function main() {
  const wdRaw = JSON.parse(await readFile(resolve("data/wikidata_coasters.json"), "utf8")) as
    | WikidataCoasterRow[]
    | { rows?: WikidataCoasterRow[] };
  const wdRows = Array.isArray(wdRaw) ? wdRaw : (wdRaw.rows ?? []);

  const csvText = await readFile(resolve("data/coaster_db.csv"), "utf8");
  const csvParsed = parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const db = await loadDbCoasters();
  const byWd = new Map<string, DbRow>();
  const byParkName = new Map<string, DbRow[]>();
  for (const row of db) {
    if (row.wikidata_id) byWd.set(row.wikidata_id.trim().toUpperCase(), row);
    const park = row.parks?.name ?? "";
    const key = `${parkKey(park)}|${normalizeNameKey(row.name)}`;
    const list = byParkName.get(key) ?? [];
    list.push(row);
    byParkName.set(key, list);
  }

  const planned = new Map<number, Patch>();

  function plan(row: DbRow, patch: Patch, source: string) {
    const baseline: DbRow = { ...row };
    const existing = planned.get(row.id);
    if (existing) {
      for (const [k, v] of Object.entries(existing)) {
        (baseline as Record<string, unknown>)[k] = v;
      }
    }
    const next = mergePatch(baseline, patch);
    if (!next) return;
    planned.set(row.id, { ...(planned.get(row.id) ?? {}), ...next });
    if (DRY_RUN && planned.size <= 8) {
      console.log(`[${source}] #${row.id} ${row.name}:`, next);
    }
  }

  let wdHits = 0;
  for (const wd of wdRows) {
    const qid = wd.wikidataId?.trim().toUpperCase();
    if (!qid) continue;
    const row = byWd.get(qid);
    if (!row) continue;
    const patch: Patch = {};
    if (wd.lengthFt != null) patch.length_ft = Math.round(wd.lengthFt);
    if (wd.speedMph != null) patch.speed_mph = Math.round(wd.speedMph);
    if (wd.heightFt != null) patch.height_ft = Math.round(wd.heightFt);
    if (wd.inversions != null) patch.inversions = wd.inversions;
    if (wd.durationS != null) patch.duration_s = Math.round(wd.durationS);
    const oy = yearFromDate(wd.openingDate);
    if (oy != null) patch.opening_year = oy;
    if (wd.manufacturerLabel) patch.manufacturer = wd.manufacturerLabel;
    const before = planned.size;
    plan(row, patch, "wikidata");
    if (planned.size > before) wdHits++;
  }

  let csvHits = 0;
  for (const raw of csvParsed.data) {
    const name = (raw.coaster_name || raw.Name || "").trim();
    const location = (raw.Location || "").trim();
    if (!name || !location) continue;

    const speed =
      parseMph(raw.speed_mph) ??
      parseMph(raw.speed1) ??
      parseMph(raw.Speed);
    const height =
      parseFeet(raw.height_ft) ??
      parseFeet(raw.height_value ? `${raw.height_value} ${raw.height_unit || "ft"}` : null) ??
      parseFeet(raw.Height);
    const length = parseFeet(raw.Length);
    const inversions = parseInversions(raw.Inversions_clean || raw.Inversions);
    const duration = parseDurationSeconds(raw.Duration);
    const manufacturerRaw = (raw.Manufacturer || "").trim();
    // CSV sometimes concatenates multi-park manufacturer notes into one cell.
    const manufacturer =
      manufacturerRaw &&
      manufacturerRaw.length <= 48 &&
      !/\([^)]{0,40}\)\s*[A-Z]/.test(manufacturerRaw)
        ? manufacturerRaw
        : undefined;
    const typeMain = (raw.Type_Main || "").trim();
    const coaster_type =
      typeMain === "Steel" || typeMain === "Wood" || typeMain === "Hybrid" ? typeMain : undefined;

    if (
      speed == null &&
      height == null &&
      length == null &&
      inversions == null &&
      duration == null &&
      !manufacturer &&
      !coaster_type
    ) {
      continue;
    }

    const key = `${parkKey(location)}|${normalizeNameKey(name)}`;
    const candidates = byParkName.get(key) ?? [];
    let rows = candidates;
    if (!rows.length) {
      const nk = normalizeNameKey(name);
      const rk = rideKey(name);
      rows = db.filter((r) => {
        if (!parksCompatible(r.parks?.name ?? "", location)) return false;
        return normalizeNameKey(r.name) === nk || rideKey(r.name) === rk;
      });
    }
    // Unique name across catalog (handles park label mismatches)
    if (!rows.length) {
      const nk = normalizeNameKey(name);
      const sameName = db.filter((r) => normalizeNameKey(r.name) === nk);
      if (sameName.length === 1) rows = sameName;
    }
    // Unique rideKey within a compatible park
    if (!rows.length) {
      const rk = rideKey(name);
      const same = db.filter(
        (r) => rideKey(r.name) === rk && parksCompatible(r.parks?.name ?? "", location),
      );
      if (same.length === 1) rows = same;
    }
    if (!rows.length) continue;

    for (const row of rows) {
      const before = planned.has(row.id);
      plan(
        row,
        {
          speed_mph: speed ?? undefined,
          height_ft: height ?? undefined,
          length_ft: length ?? undefined,
          inversions: inversions ?? undefined,
          duration_s: duration ?? undefined,
          manufacturer,
          coaster_type,
        },
        "csv",
      );
      if (!before && planned.has(row.id)) csvHits++;
    }
  }

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}Planned updates: ${planned.size} (wikidata touches≈${wdHits}, csv touches≈${csvHits})`,
  );

  if (DRY_RUN) return;

  let updated = 0;
  for (const [id, patch] of planned) {
    const { error } = await supabase.from("coasters").update(patch).eq("id", id);
    if (error) {
      console.warn(`Failed #${id}:`, error.message);
      continue;
    }
    updated++;
  }
  console.log(`Updated ${updated} coasters.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
