import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";

/**
 * Insert or update coasters by (park_id, external_source, external_id) without PostgREST
 * `ON CONFLICT`, which often fails against the partial unique index on those columns.
 */
export async function upsertCoastersByExternalKeys(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;

  const parkIds = [...new Set(rows.map((r) => Number(r.park_id)))];
  const { data: existing, error: selErr } = await fetchAllPages<{
    id: number;
    park_id: number;
    external_source: string | null;
    external_id: string | null;
  }>(SUPABASE_PAGE_SIZE, (from, to) =>
    supabase
      .from("coasters")
      .select("id, park_id, external_source, external_id")
      .in("park_id", parkIds)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (selErr) throw selErr;

  const keyOf = (p: number, s: string, e: string) => `${p}\0${s}\0${e}`;
  const idByKey = new Map<string, number>();
  for (const r of existing) {
    const p = r.park_id;
    const s = r.external_source;
    const e = r.external_id;
    if (p == null || s == null || e == null) continue;
    idByKey.set(keyOf(Number(p), String(s), String(e)), Number(r.id));
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: number; row: Record<string, unknown> }[] = [];
  for (const row of rows) {
    const k = keyOf(
      Number(row.park_id),
      String(row.external_source),
      String(row.external_id),
    );
    const existingId = idByKey.get(k);
    if (existingId != null) {
      toUpdate.push({ id: existingId, row });
    } else {
      toInsert.push(row);
    }
  }

  const INSERT_CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from("coasters").insert(chunk);
    if (error) throw error;
  }

  const UPDATE_PARALLEL = 40;
  for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
    const slice = toUpdate.slice(i, i + UPDATE_PARALLEL);
    const results = await Promise.all(
      slice.map(({ id, row }) => supabase.from("coasters").update(row).eq("id", id)),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) throw err;
  }
}
