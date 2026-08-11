/**
 * Apply verified field overrides from CoasterTrak Data (official sources, review queue).
 */

import type { Coaster } from "@/types/domain";

export type FieldOverrideRow = {
  coaster_id: number;
  field_name: string;
  value_int: number | null;
  value_text: string | null;
  source?: string | null;
  source_url?: string | null;
  approved?: boolean;
};

const OVERRIDE_FIELDS = new Set([
  "height_ft",
  "speed_mph",
  "length_ft",
  "duration_s",
  "inversions",
  "name",
  "status",
]);

export function buildFieldOverrideMap(
  rows: FieldOverrideRow[],
): Map<number, Map<string, FieldOverrideRow>> {
  const byCoaster = new Map<number, Map<string, FieldOverrideRow>>();
  for (const row of rows) {
    if (row.approved === false) continue;
    if (!OVERRIDE_FIELDS.has(row.field_name)) continue;
    let fields = byCoaster.get(row.coaster_id);
    if (!fields) {
      fields = new Map();
      byCoaster.set(row.coaster_id, fields);
    }
    fields.set(row.field_name, row);
  }
  return byCoaster;
}

export function applyFieldOverrides<T extends Coaster>(
  coaster: T,
  overrides: Map<number, Map<string, FieldOverrideRow>> | undefined,
): T {
  if (!overrides) return coaster;
  const fields = overrides.get(coaster.id);
  if (!fields?.size) return coaster;

  let out = { ...coaster } as T;
  for (const [fieldName, row] of fields) {
    if (fieldName === "name" && row.value_text) {
      out = { ...out, name: row.value_text };
      continue;
    }
    if (fieldName === "status" && row.value_text) {
      out = { ...out, status: row.value_text };
      continue;
    }
    if (row.value_int == null) continue;
    out = { ...out, [fieldName]: row.value_int } as T;
  }
  return out;
}

export function applyFieldOverridesList<T extends Coaster>(
  coasters: T[],
  overrides: Map<number, Map<string, FieldOverrideRow>> | undefined,
): T[] {
  if (!overrides?.size) return coasters;
  return coasters.map((c) => applyFieldOverrides(c, overrides));
}
