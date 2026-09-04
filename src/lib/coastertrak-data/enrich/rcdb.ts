/**
 * Apply RCDB stats to Wikidata snapshot rows (null-fill only).
 * CoasterTrak has written permission for this ingest path.
 */

import { normalizeRcdbId, rcdbCoasterUrl } from "@/lib/rcdb";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

export type RcdbStatsExportRow = {
  /** Numeric RCDB id (or rcdb.com URL) */
  rcdbId: string;
  lengthFt?: number | null;
  heightFt?: number | null;
  speedMph?: number | null;
  durationS?: number | null;
  inversions?: number | null;
  /** e.g. Operating / Defunct — mapped onto Wikidata status when present */
  status?: string | null;
};

export type RcdbEnrichResult = {
  rows: WikidataCoasterRow[];
  matched: number;
  fieldsFilled: number;
  unmatchedExportIds: string[];
};

function roundInt(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n);
}

function mapStatus(raw: string | null | undefined): WikidataCoasterRow["status"] | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === "operating" || s === "open") return "operating";
  if (
    s === "defunct" ||
    s.includes("removed") ||
    s.includes("demolished") ||
    s === "closed" ||
    s === "sbno" ||
    s.includes("standing but not operating")
  ) {
    return "defunct";
  }
  return null;
}

/** Normalize one export row; returns null if id is invalid. */
export function normalizeRcdbExportRow(row: RcdbStatsExportRow): (RcdbStatsExportRow & { rcdbId: string }) | null {
  const rcdbId = normalizeRcdbId(row.rcdbId);
  if (!rcdbId) return null;
  return {
    rcdbId,
    lengthFt: roundInt(row.lengthFt ?? null),
    heightFt: roundInt(row.heightFt ?? null),
    speedMph: roundInt(row.speedMph ?? null),
    durationS: roundInt(row.durationS ?? null),
    inversions: roundInt(row.inversions ?? null),
    status: row.status?.trim() || null,
  };
}

export function buildRcdbExportMap(
  exportRows: RcdbStatsExportRow[],
): Map<string, RcdbStatsExportRow & { rcdbId: string }> {
  const map = new Map<string, RcdbStatsExportRow & { rcdbId: string }>();
  for (const raw of exportRows) {
    const row = normalizeRcdbExportRow(raw);
    if (!row) continue;
    map.set(row.rcdbId, row);
  }
  return map;
}

/**
 * Null-fill snapshot stats from an RCDB export keyed by rcdbId.
 * Never overwrites existing non-null measurement fields.
 */
export function enrichWikidataRowsFromRcdbExport(
  rows: WikidataCoasterRow[],
  exportRows: RcdbStatsExportRow[],
): RcdbEnrichResult {
  const byId = buildRcdbExportMap(exportRows);
  const used = new Set<string>();
  let matched = 0;
  let fieldsFilled = 0;

  const out = rows.map((row) => {
    const id = normalizeRcdbId(row.rcdbId);
    if (!id) return row;
    const src = byId.get(id);
    if (!src) return row;

    used.add(id);
    matched++;
    let next: WikidataCoasterRow = { ...row, rcdbId: id };
    let filled = 0;

    if (next.lengthFt == null && src.lengthFt != null) {
      next = { ...next, lengthFt: src.lengthFt };
      filled++;
    }
    if (next.heightFt == null && src.heightFt != null) {
      next = { ...next, heightFt: src.heightFt };
      filled++;
    }
    if (next.speedMph == null && src.speedMph != null) {
      next = { ...next, speedMph: src.speedMph };
      filled++;
    }
    if (next.durationS == null && src.durationS != null) {
      next = { ...next, durationS: src.durationS };
      filled++;
    }
    if (next.inversions == null && src.inversions != null) {
      next = { ...next, inversions: src.inversions };
      filled++;
    }
    const mappedStatus = mapStatus(src.status);
    if (mappedStatus && (next.status === "unknown" || next.status == null)) {
      next = { ...next, status: mappedStatus };
      filled++;
    }

    fieldsFilled += filled;
    return next;
  });

  const unmatchedExportIds = [...byId.keys()].filter((id) => !used.has(id));
  return { rows: out, matched, fieldsFilled, unmatchedExportIds };
}

export type RcdbDbOverridePatch = {
  coaster_id: number;
  field_name: string;
  value_int: number | null;
  value_text: string | null;
  source: "rcdb";
  source_url: string;
  approved: true;
};

/** Build approved field-override rows for null DB columns (provenance). */
export function buildRcdbFieldOverridePatches(
  coasterId: number,
  rcdbId: string,
  current: {
    length_ft?: number | null;
    height_ft?: number | null;
    speed_mph?: number | null;
    duration_s?: number | null;
    inversions?: number | null;
    status?: string | null;
  },
  stats: RcdbStatsExportRow & { rcdbId: string },
): RcdbDbOverridePatch[] {
  const url = rcdbCoasterUrl(rcdbId) ?? `https://rcdb.com/${rcdbId}.htm`;
  const patches: RcdbDbOverridePatch[] = [];
  const pushInt = (field_name: string, currentVal: number | null | undefined, next: number | null | undefined) => {
    if (currentVal != null || next == null) return;
    patches.push({
      coaster_id: coasterId,
      field_name,
      value_int: next,
      value_text: null,
      source: "rcdb",
      source_url: url,
      approved: true,
    });
  };

  pushInt("length_ft", current.length_ft, stats.lengthFt);
  pushInt("height_ft", current.height_ft, stats.heightFt);
  pushInt("speed_mph", current.speed_mph, stats.speedMph);
  pushInt("duration_s", current.duration_s, stats.durationS);
  pushInt("inversions", current.inversions, stats.inversions);

  const mapped = mapStatus(stats.status);
  if (mapped && (!current.status?.trim() || current.status === "Unknown")) {
    patches.push({
      coaster_id: coasterId,
      field_name: "status",
      value_int: null,
      value_text: mapped === "defunct" ? "Defunct" : "Operating",
      source: "rcdb",
      source_url: url,
      approved: true,
    });
  }

  return patches;
}
