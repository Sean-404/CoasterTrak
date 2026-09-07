/**
 * Backfill park Wikidata IDs from the published catalog snapshot.
 *
 * The admin quality report flags parks whose external_id is not a Q-id.
 * Sync only writes those IDs for parks it touches; most catalog parks never got one.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-park-wikidata-ids.ts
 *   npx tsx --env-file=.env.local scripts/backfill-park-wikidata-ids.ts --apply
 */
import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import { isCatalogHiddenParkName, normalizeParkNameForMatch } from "../src/lib/park-match";
import type { WikidataCoasterRow } from "../src/lib/wikidata-coasters";

type ParkRow = {
  id: number;
  name: string;
  country: string | null;
  external_source: string | null;
  external_id: string | null;
};

const DEFAULT_SNAPSHOT =
  "https://bbpxiqucihcxrbbzqbtc.supabase.co/storage/v1/object/public/catalog/wikidata_coasters.json";
const REPORT_PREFIX = "coastertrak-data/latest";

function isQid(value: string | null | undefined): boolean {
  return /^Q\d+$/i.test(value?.trim() ?? "");
}

async function loadSnapshot(url: string): Promise<WikidataCoasterRow[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Snapshot fetch failed (${res.status})`);
  const payload = (await res.json()) as WikidataCoasterRow[];
  if (!Array.isArray(payload)) throw new Error("Snapshot is not an array");
  return payload;
}

function snapshotParkQids(rows: WikidataCoasterRow[]): Map<string, string> {
  const byName = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const qid = row.parkWikidataId?.trim().toUpperCase();
    const label = row.parkLabel?.trim();
    if (!qid || !label || !isQid(qid)) continue;
    const key = normalizeParkNameForMatch(label);
    if (!key) continue;
    const counts = byName.get(key) ?? new Map<string, number>();
    counts.set(qid, (counts.get(qid) ?? 0) + 1);
    byName.set(key, counts);
  }

  const unique = new Map<string, string>();
  for (const [name, counts] of byName) {
    if (counts.size !== 1) continue;
    unique.set(name, [...counts.keys()][0]!);
  }
  return unique;
}

async function refreshQualityReport(
  supabase: ReturnType<typeof createServiceRoleClient>,
  linkedParkIds: Set<number>,
): Promise<void> {
  if (linkedParkIds.size === 0) return;

  const bucket = supabase.storage.from("catalog");
  const { data, error } = await bucket.download(`${REPORT_PREFIX}/report.json`);
  if (error || !data) {
    console.error(`  skipped report refresh: ${error?.message ?? "missing report.json"}`);
    return;
  }

  const report = JSON.parse(await data.text()) as {
    generatedAt?: string;
    summary?: { errors: number; warnings: number; info: number; passed: number };
    findings?: Array<{ code: string; severity: string; entityType?: string; entityId?: string }>;
  };
  const before = report.findings?.length ?? 0;
  const findings = (report.findings ?? []).filter((finding) => {
    if (finding.code !== "missing_wikidata_id" || finding.entityType !== "park" || !finding.entityId) {
      return true;
    }
    const match = finding.entityId.match(/^park_db_(\d+)$/);
    if (!match) return true;
    return !linkedParkIds.has(Number(match[1]));
  });

  const summary = {
    ...(report.summary ?? { errors: 0, warnings: 0, info: 0, passed: 0 }),
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  const next = {
    ...report,
    generatedAt: new Date().toISOString(),
    summary,
    findings,
  };

  const { error: upErr } = await bucket.upload(
    `${REPORT_PREFIX}/report.json`,
    JSON.stringify(next),
    { contentType: "application/json", upsert: true },
  );
  if (upErr) throw new Error(`report upload: ${upErr.message}`);
  console.error(`  quality report ${before} → ${findings.length} findings`);
}

async function main() {
  const apply = hasFlag("--apply");
  const snapshotUrl = arg("--snapshot") ?? DEFAULT_SNAPSHOT;
  console.error(apply ? "Mode: APPLY" : "Mode: dry-run (pass --apply to write)");
  console.error(`Snapshot: ${snapshotUrl}`);

  const snapshot = await loadSnapshot(snapshotUrl);
  const qidByName = snapshotParkQids(snapshot);
  console.error(`Unique snapshot park names: ${qidByName.size}`);

  const supabase = createServiceRoleClient();
  const { data: parks, error } = await fetchAllPages<ParkRow>(SUPABASE_PAGE_SIZE, (from, to) =>
    supabase
      .from("parks")
      .select("id,name,country,external_source,external_id")
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw new Error(error.message);

  const usedQids = new Set(
    parks.map((park) => park.external_id?.trim().toUpperCase()).filter((id): id is string => isQid(id)),
  );

  const updates: Array<{ id: number; name: string; qid: string }> = [];
  const claimed = new Map<string, number>();

  for (const park of parks) {
    if (isQid(park.external_id)) continue;
    if (isCatalogHiddenParkName(park.name)) continue;
    const key = normalizeParkNameForMatch(park.name);
    const qid = qidByName.get(key);
    if (!qid || usedQids.has(qid)) continue;
    const claimedBy = claimed.get(qid);
    if (claimedBy != null && claimedBy !== park.id) continue;
    claimed.set(qid, park.id);
    updates.push({ id: park.id, name: park.name, qid });
  }

  console.error(`Parks to link: ${updates.length}`);
  for (const row of updates.slice(0, 20)) {
    console.error(`  ${row.id} ${row.name} → ${row.qid}`);
  }
  if (updates.length > 20) console.error(`  … ${updates.length - 20} more`);

  if (!apply) return;

  const linked = new Set<number>();
  for (const row of updates) {
    const { error: updateError } = await supabase
      .from("parks")
      .update({
        external_source: "wikidata",
        external_id: row.qid,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .is("external_id", null);
    if (updateError) throw new Error(`park ${row.id}: ${updateError.message}`);
    linked.add(row.id);
  }

  console.error(`Linked ${linked.size} parks`);
  await refreshQualityReport(supabase, linked);
}

runMain(main);
