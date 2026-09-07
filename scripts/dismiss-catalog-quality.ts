/**
 * Dismiss the currently published catalog-quality findings and review items.
 * Does not change park or coaster rows. A later publish of the same issues
 * stays hidden via dismissed.json.
 *
 *   npx tsx --env-file=.env.local scripts/dismiss-catalog-quality.ts
 *   npx tsx --env-file=.env.local scripts/dismiss-catalog-quality.ts --apply
 */
import { hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import {
  CATALOG_QUALITY_BUCKET,
  CATALOG_QUALITY_DISMISSALS_PATH,
  CATALOG_QUALITY_PREFIX,
  catalogFindingDismissKey,
  catalogReviewDismissKey,
  type CatalogQualityDismissals,
  type CatalogQualityReport,
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

runMain(main);
