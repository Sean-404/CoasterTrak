/**
 * Dismiss the currently published catalog-quality findings and review items.
 * Does not change park or coaster rows. A later publish of the same issues
 * stays hidden via dismissed.json.
 *
 *   npx tsx --env-file=.env.local scripts/dismiss-catalog-quality.ts
 *   npx tsx --env-file=.env.local scripts/dismiss-catalog-quality.ts --apply
 *
 * Dismiss only the review items for some coaster rows (e.g. rows hidden from the catalog),
 * leaving the rest of the report and queue published:
 *   npx tsx --env-file=.env.local scripts/dismiss-catalog-quality.ts --coaster-ids 524,9487 --apply
 */
import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import {
  CATALOG_QUALITY_BUCKET,
  CATALOG_QUALITY_DISMISSALS_PATH,
  CATALOG_QUALITY_PREFIX,
  catalogFindingDismissKey,
  catalogReviewDismissKey,
  type CatalogQualityDismissals,
  type CatalogQualityReport,
  type CatalogReviewItem,
  type CatalogReviewQueue,
} from "../src/lib/catalog-quality-storage";

async function downloadJson<T>(path: string): Promise<T | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(CATALOG_QUALITY_BUCKET).download(path);
  if (error || !data) return null;
  return JSON.parse(await data.text()) as T;
}

async function uploadJson(path: string, payload: unknown): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(CATALOG_QUALITY_BUCKET).upload(path, JSON.stringify(payload), {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(`${path}: ${error.message}`);
}

async function main() {
  const apply = hasFlag("--apply");
  console.error(apply ? "Mode: APPLY" : "Mode: dry-run (pass --apply to write)");
  const coasterIds = arg("--coaster-ids")
    ?.split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (coasterIds) return dismissCoasterItems(new Set(coasterIds), apply);

  const [report, reviewQueue, existing] = await Promise.all([
    downloadJson<CatalogQualityReport>(`${CATALOG_QUALITY_PREFIX}/report.json`),
    downloadJson<CatalogReviewQueue>(`${CATALOG_QUALITY_PREFIX}/review-queue.json`),
    downloadJson<CatalogQualityDismissals>(CATALOG_QUALITY_DISMISSALS_PATH),
  ]);

  if (!report && !reviewQueue) {
    throw new Error("No published catalog quality report to dismiss.");
  }

  const keys = new Set(existing?.keys ?? []);
  for (const finding of report?.findings ?? []) keys.add(catalogFindingDismissKey(finding));
  for (const item of reviewQueue?.items ?? []) keys.add(catalogReviewDismissKey(item));

  console.error(
    `Dismissing ${report?.findings.length ?? 0} findings and ${reviewQueue?.items.length ?? 0} review items (${keys.size} keys).`,
  );
  if (!apply) return;

  const dismissedAt = new Date().toISOString();
  const dismissals: CatalogQualityDismissals = {
    version: 1,
    dismissedAt,
    keys: [...keys],
  };

  await uploadJson(CATALOG_QUALITY_DISMISSALS_PATH, dismissals);

  if (report) {
    await uploadJson(`${CATALOG_QUALITY_PREFIX}/report.json`, {
      ...report,
      generatedAt: dismissedAt,
      findings: [],
      summary: {
        ...report.summary,
        errors: 0,
        warnings: 0,
        info: 0,
      },
    });
  }

  if (reviewQueue) {
    await uploadJson(`${CATALOG_QUALITY_PREFIX}/review-queue.json`, {
      ...reviewQueue,
      generatedAt: dismissedAt,
      items: [],
    });
  }

  console.error("Published report cleared. Same issues stay dismissed after the next quality publish.");
}

/** Dismiss and unpublish the review items for the given coaster ids only. */
async function dismissCoasterItems(ids: Set<number>, apply: boolean) {
  const [reviewQueue, existing] = await Promise.all([
    downloadJson<CatalogReviewQueue>(`${CATALOG_QUALITY_PREFIX}/review-queue.json`),
    downloadJson<CatalogQualityDismissals>(CATALOG_QUALITY_DISMISSALS_PATH),
  ]);
  if (!reviewQueue) throw new Error("No published review queue.");

  // Duplicate pairs carry no dbId, only coastertrak-data entity ids
  // (coaster_wikidata_Q… when the row has a QID, else coaster_db_<id>).
  const { data: rows, error } = await createServiceRoleClient()
    .from("coasters")
    .select("id,wikidata_id,external_id")
    .in("id", [...ids]);
  if (error) throw new Error(error.message);
  const entityIds = new Set<string>();
  for (const row of rows ?? []) {
    const qid = (row.wikidata_id ?? row.external_id)?.match(/^Q\d+$/i)?.[0];
    entityIds.add(qid ? `coaster_wikidata_${qid.toUpperCase()}` : `coaster_db_${row.id}`);
  }

  const matches = (item: CatalogReviewItem) =>
    item.entityType === "coaster" &&
    ((item.dbId != null && ids.has(item.dbId)) ||
      (item.type === "POSSIBLE_DUPLICATE" &&
        (entityIds.has(item.entityA ?? "") || entityIds.has(item.entityB ?? ""))));
  const picked = reviewQueue.items.filter(matches);
  for (const item of picked) {
    const label = item.type === "POSSIBLE_DUPLICATE" ? `${item.nameA} / ${item.nameB}` : (item.entityName ?? item.entityId);
    console.error(`  ${item.type} ${item.field ?? ""} — ${label}`);
  }
  console.error(`Dismissing ${picked.length} review items for ${ids.size} coaster ids.`);
  if (!apply || picked.length === 0) return;

  const keys = new Set(existing?.keys ?? []);
  for (const item of picked) keys.add(catalogReviewDismissKey(item));
  const dismissedAt = new Date().toISOString();
  await uploadJson(CATALOG_QUALITY_DISMISSALS_PATH, { version: 1, dismissedAt, keys: [...keys] });
  await uploadJson(`${CATALOG_QUALITY_PREFIX}/review-queue.json`, {
    ...reviewQueue,
    generatedAt: dismissedAt,
    items: reviewQueue.items.filter((item) => !matches(item)),
  });
}

runMain(main);
