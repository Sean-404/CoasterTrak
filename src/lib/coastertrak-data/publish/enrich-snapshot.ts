import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import {
  type FieldOverrideRow,
} from "@/lib/data-platform/field-overrides";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

const WIKIDATA_OVERRIDE_FIELDS = new Set([
  "height_ft",
  "speed_mph",
  "length_ft",
  "duration_s",
  "inversions",
  "name",
  "status",
]);

export type WikidataFieldOverrideRow = FieldOverrideRow & {
  wikidata_id: string;
};

function catalogStatusToWikidata(status: string | undefined): WikidataCoasterRow["status"] {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "operating" || s === "open") return "operating";
  if (s === "defunct" || s === "closed") return "defunct";
  return "unknown";
}

function wikidataStatusToCatalog(status: WikidataCoasterRow["status"]): string {
  if (status === "operating") return "Operating";
  if (status === "defunct") return "Defunct";
  return "Unknown";
}

/** Map snapshot row → catalog shape for known-fix helpers, then map back. */
export function applyKnownFixesToWikidataRow(row: WikidataCoasterRow): WikidataCoasterRow {
  const fixed = applyCoasterKnownFixes({
    name: row.label,
    wikidata_id: row.wikidataId,
    coaster_type: row.coasterTypeLabel ?? undefined,
    status: wikidataStatusToCatalog(row.status),
    manufacturer: row.manufacturerLabel ?? undefined,
    height_ft: row.heightFt,
    speed_mph: row.speedMph,
    length_ft: row.lengthFt,
    duration_s: row.durationS,
    inversions: row.inversions,
    image_url: row.imageUrl,
  });

  return {
    ...row,
    label: fixed.name ?? row.label,
    coasterTypeLabel: fixed.coaster_type ?? row.coasterTypeLabel,
    manufacturerLabel: fixed.manufacturer ?? row.manufacturerLabel,
    heightFt: fixed.height_ft ?? row.heightFt,
    speedMph: fixed.speed_mph ?? row.speedMph,
    lengthFt: fixed.length_ft ?? row.lengthFt,
    durationS: fixed.duration_s ?? row.durationS,
    inversions: fixed.inversions ?? row.inversions,
    imageUrl: fixed.image_url ?? row.imageUrl,
    status: fixed.status ? catalogStatusToWikidata(fixed.status) : row.status,
  };
}

export function buildWikidataFieldOverrideMap(
  rows: WikidataFieldOverrideRow[],
): Map<string, Map<string, FieldOverrideRow>> {
  const byWikidataId = new Map<string, Map<string, FieldOverrideRow>>();
  for (const row of rows) {
    if (row.approved === false) continue;
    if (!WIKIDATA_OVERRIDE_FIELDS.has(row.field_name)) continue;
    const qid = row.wikidata_id.trim().toUpperCase();
    if (!qid) continue;
    let fields = byWikidataId.get(qid);
    if (!fields) {
      fields = new Map();
      byWikidataId.set(qid, fields);
    }
    fields.set(row.field_name, row);
  }
  return byWikidataId;
}

export function applyWikidataFieldOverrides(
  row: WikidataCoasterRow,
  overrides: Map<string, Map<string, FieldOverrideRow>>,
): WikidataCoasterRow {
  const fields = overrides.get(row.wikidataId.trim().toUpperCase());
  if (!fields?.size) return row;

  let out: WikidataCoasterRow = { ...row };
  for (const [fieldName, override] of fields) {
    if (fieldName === "name" && override.value_text) {
      out = { ...out, label: override.value_text };
      continue;
    }
    if (fieldName === "status" && override.value_text) {
      out = { ...out, status: catalogStatusToWikidata(override.value_text) };
      continue;
    }
    if (override.value_int == null) continue;
    switch (fieldName) {
      case "height_ft":
        out = { ...out, heightFt: override.value_int };
        break;
      case "speed_mph":
        out = { ...out, speedMph: override.value_int };
        break;
      case "length_ft":
        out = { ...out, lengthFt: override.value_int };
        break;
      case "duration_s":
        out = { ...out, durationS: override.value_int };
        break;
      case "inversions":
        out = { ...out, inversions: override.value_int };
        break;
    }
  }
  return out;
}

export function enrichWikidataSnapshot(
  rows: WikidataCoasterRow[],
  overrides: Map<string, Map<string, FieldOverrideRow>> = new Map(),
): { rows: WikidataCoasterRow[]; knownFixesApplied: number; fieldOverridesApplied: number } {
  let knownFixesApplied = 0;
  let fieldOverridesApplied = 0;

  const enriched = rows.map((row) => {
    const beforeLabel = row.label;
    const beforeHeight = row.heightFt;
    let next = applyKnownFixesToWikidataRow(row);
    if (
      next.label !== beforeLabel ||
      next.heightFt !== beforeHeight ||
      next.status !== row.status ||
      next.coasterTypeLabel !== row.coasterTypeLabel
    ) {
      knownFixesApplied += 1;
    }

    const beforeOverrideHeight = next.heightFt;
    next = applyWikidataFieldOverrides(next, overrides);
    if (next.heightFt !== beforeOverrideHeight || next.label !== row.label) {
      fieldOverridesApplied += 1;
    }

    return next;
  });

  return { rows: enriched, knownFixesApplied, fieldOverridesApplied };
}
