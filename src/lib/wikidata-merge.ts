/**
 * Match CoasterTrak CSV rows to Wikidata coaster rows by normalized name
 * and optional location / park hints.
 */

import type { WikidataCoasterRow } from "./wikidata-coasters";
import { normalizeNameKey } from "./wikidata-coasters";

export type CsvCoasterRow = Record<string, string>;

export type WikidataMatch = {
  coaster_name: string;
  Location: string;
  wikidataId: string | null;
  wikidataLabel: string | null;
  matchReason: "exact_name" | "name_and_location" | "none";
};

function getField(row: CsvCoasterRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function matchCsvRowToWikidata(
  csvRow: CsvCoasterRow,
  byNormalizedName: Map<string, WikidataCoasterRow[]>,
): WikidataCoasterRow | null {
  const name = getField(csvRow, ["coaster_name", "Name"]);
  const location = getField(csvRow, ["Location"]);
  if (!name) return null;

  const nk = normalizeNameKey(name);
  const candidates = byNormalizedName.get(nk);
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0];

  const loc = location.toLowerCase();
  for (const c of candidates) {
    const pl = (c.parkLabel ?? "").toLowerCase();
    const cl = (c.countryLabel ?? "").toLowerCase();
    if (pl && loc.includes(pl)) return c;
    if (cl && loc.includes(cl)) return c;
  }
  return candidates[0];
}

export function indexWikidataByNormalizedName(
  rows: WikidataCoasterRow[],
): Map<string, WikidataCoasterRow[]> {
  const map = new Map<string, WikidataCoasterRow[]>();
  for (const r of rows) {
    const k = normalizeNameKey(r.label);
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return map;
}

export function matchAllCsvRows(
  csvRows: CsvCoasterRow[],
  wikidataRows: WikidataCoasterRow[],
): WikidataMatch[] {
  const idx = indexWikidataByNormalizedName(wikidataRows);
  const out: WikidataMatch[] = [];

  for (const row of csvRows) {
    const name = getField(row, ["coaster_name", "Name"]);
    const location = getField(row, ["Location"]);
    const nk = normalizeNameKey(name);
    const candidates = idx.get(nk);
    const wd = matchCsvRowToWikidata(row, idx);

    let reason: WikidataMatch["matchReason"] = "none";
    if (wd) {
      if (candidates && candidates.length === 1) reason = "exact_name";
      else reason = "name_and_location";
    }

    out.push({
      coaster_name: name,
      Location: location,
      wikidataId: wd?.wikidataId ?? null,
      wikidataLabel: wd?.label ?? null,
      matchReason: reason,
    });
  }
  return out;
}
