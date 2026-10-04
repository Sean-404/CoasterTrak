import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";

export type UpsertedCoasterRef = {
  id: number;
  name: string;
  parkId: number;
};

export type CoasterUpsertResult = {
  inserted: UpsertedCoasterRef[];
  /** Rows whose public catalog fields actually changed (not mere last_synced_at). */
  contentChanged: UpsertedCoasterRef[];
};

const CONTENT_COLUMNS =
  "id, park_id, external_source, external_id, name, wikidata_id, rcdb_id, coaster_type, manufacturer, image_url, status, length_ft, speed_mph, height_ft, inversions, duration_s, opening_year, closing_year, enwiki_title";

type ExistingCoaster = {
  id: number;
  park_id: number;
  external_source: string | null;
  external_id: string | null;
  name: string;
  wikidata_id: string | null;
  rcdb_id: number | null;
  coaster_type: string | null;
  manufacturer: string | null;
  image_url: string | null;
  status: string | null;
  length_ft: number | null;
  speed_mph: number | null;
  height_ft: number | null;
  inversions: number | null;
  duration_s: number | null;
  opening_year: number | null;
  closing_year: number | null;
  enwiki_title: string | null;
};

function normStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function normNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Compare fields that affect public catalog pages (ignore last_synced_at). */
export function coasterPublicFieldsChanged(
  existing: ExistingCoaster,
  row: Record<string, unknown>,
): boolean {
  const checks: Array<[unknown, unknown]> = [
    [existing.park_id, normNum(row.park_id)],
    [normStr(existing.name), normStr(row.name)],
    [normStr(existing.wikidata_id), normStr(row.wikidata_id)],
    [normNum(existing.rcdb_id), normNum(row.rcdb_id)],
    [normStr(existing.coaster_type), normStr(row.coaster_type)],
    [normStr(existing.manufacturer), normStr(row.manufacturer)],
    [normStr(existing.image_url), normStr(row.image_url)],
    [normStr(existing.status), normStr(row.status)],
    [normNum(existing.length_ft), normNum(row.length_ft)],
    [normNum(existing.speed_mph), normNum(row.speed_mph)],
    [normNum(existing.height_ft), normNum(row.height_ft)],
    [normNum(existing.inversions), normNum(row.inversions)],
    [normNum(existing.duration_s), normNum(row.duration_s)],
    [normNum(existing.opening_year), normNum(row.opening_year)],
    [normNum(existing.closing_year), normNum(row.closing_year)],
    [normStr(existing.enwiki_title), normStr(row.enwiki_title)],
  ];
  return checks.some(([a, b]) => a !== b);
}

/**
 * Insert or update coasters by (park_id, external_source, external_id) without PostgREST
 * `ON CONFLICT`, which often fails against the partial unique index on those columns.
 */
export async function upsertCoastersByExternalKeys(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<CoasterUpsertResult> {
  const inserted: UpsertedCoasterRef[] = [];
  const contentChanged: UpsertedCoasterRef[] = [];
  if (!rows.length) return { inserted, contentChanged };

  const parkIds = [...new Set(rows.map((r) => Number(r.park_id)))];
  const { data: existing, error: selErr } = await fetchAllPages<ExistingCoaster>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select(CONTENT_COLUMNS)
        .in("park_id", parkIds)
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (selErr) throw selErr;

  const keyOf = (p: number, s: string, e: string) => `${p}\0${s}\0${e}`;
  const byKey = new Map<string, ExistingCoaster>();
  for (const r of existing) {
    const p = r.park_id;
    const s = r.external_source;
    const e = r.external_id;
    if (p == null || s == null || e == null) continue;
    byKey.set(keyOf(Number(p), String(s), String(e)), r);
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: number; row: Record<string, unknown>; contentChanged: boolean }[] = [];
  for (const row of rows) {
    const k = keyOf(
      Number(row.park_id),
      String(row.external_source),
      String(row.external_id),
    );
    const prev = byKey.get(k);
    if (prev != null) {
      toUpdate.push({
        id: prev.id,
        row,
        contentChanged: coasterPublicFieldsChanged(prev, row),
      });
    } else {
      toInsert.push(row);
    }
  }

  const INSERT_CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { data, error } = await supabase
      .from("coasters")
      .insert(chunk)
      .select("id, name, park_id");
    if (error) throw error;
    for (const row of data ?? []) {
      inserted.push({
        id: Number(row.id),
        name: String(row.name ?? ""),
        parkId: Number(row.park_id),
      });
    }
  }

  const UPDATE_PARALLEL = 40;
  for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
    const slice = toUpdate.slice(i, i + UPDATE_PARALLEL);
    const results = await Promise.all(
      slice.map(({ id, row }) => supabase.from("coasters").update(row).eq("id", id)),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) throw err;
    for (const item of slice) {
      if (!item.contentChanged) continue;
      contentChanged.push({
        id: item.id,
        name: String(item.row.name ?? ""),
        parkId: Number(item.row.park_id),
      });
    }
  }

  return { inserted, contentChanged };
}
