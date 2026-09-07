import type { SupabaseClient } from "@supabase/supabase-js";

export const CATALOG_QUALITY_BUCKET = "catalog";
export const CATALOG_QUALITY_PREFIX = "coastertrak-data/latest";
export const CATALOG_QUALITY_DISMISSALS_PATH = `${CATALOG_QUALITY_PREFIX}/dismissed.json`;

/** Current catalog writer. Queue-Times and Kaggle rows in `sync_runs` are retired. */
const CATALOG_SYNC_SOURCE = "wikidata";

export type CatalogQualityMeta = {
  version?: number;
  generatedAt?: string;
  source?: string;
  runId?: string;
  parkCount?: number;
  coasterCount?: number;
};

export type CatalogQualityFinding = {
  severity: string;
  code: string;
  message: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  details?: Record<string, unknown>;
};

export type CatalogQualityReport = {
  version: number;
  generatedAt: string;
  sourceRunId: string;
  summary: {
    coasters: number;
    parks: number;
    errors: number;
    warnings: number;
    info: number;
    passed: number;
  };
  findings: CatalogQualityFinding[];
};

export type CatalogReviewItem = {
  type: string;
  entityType?: string;
  entityA?: string;
  entityB?: string;
  nameA?: string;
  nameB?: string;
  entityId?: string;
  entityName?: string;
  field?: string;
  fields?: string[];
  confidence?: string;
  reasons?: string[];
  reason?: string;
  action?: string;
  dbId?: number;
  parkName?: string | null;
  publicPath?: string;
};

export type CatalogReviewQueue = {
  version: number;
  generatedAt: string;
  items: CatalogReviewItem[];
};

export type CatalogAiReviewAssessment = {
  itemKey: string;
  plausible: boolean;
  confidence: string;
  issue: string;
  suggestedAction?: string;
};

export type CatalogAiReview = {
  version: number;
  generatedAt: string;
  sourceRunId: string;
  model: string;
  itemsReviewed: number;
  estimatedCostUsd: number;
  assessments: CatalogAiReviewAssessment[];
};

export type CatalogQualityDismissals = {
  version: 1;
  dismissedAt: string;
  keys: string[];
};

export type CatalogQualitySnapshot = {
  available: boolean;
  meta: CatalogQualityMeta | null;
  report: CatalogQualityReport | null;
  reviewQueue: CatalogReviewQueue | null;
  aiReview: CatalogAiReview | null;
  reviewCounts: Record<string, number>;
  dismissedCount: number;
  dbCounts: { parks: number; coasters: number } | null;
  lastSync: {
    source: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    records_updated: number;
    error: string | null;
  } | null;
  error?: string;
};

function findingOtherId(finding: CatalogQualityFinding): string {
  const other = finding.details?.entityB;
  return typeof other === "string" ? other : "";
}

function findingFields(finding: CatalogQualityFinding): string {
  const fields = finding.details?.fields;
  return Array.isArray(fields) ? fields.map(String).join(",") : "";
}

/** Stable id so a later publish of the same issue stays dismissed. */
export function catalogFindingDismissKey(finding: CatalogQualityFinding): string {
  return [
    "finding",
    finding.code,
    finding.entityType ?? "",
    finding.entityId ?? "",
    findingOtherId(finding),
    findingFields(finding),
  ].join("|");
}

export function catalogReviewDismissKey(item: CatalogReviewItem): string {
  return [
    "review",
    item.type,
    item.entityType ?? "",
    item.entityA ?? item.entityId ?? "",
    item.entityB ?? item.field ?? "",
    item.entityName ?? item.nameA ?? "",
  ].join("|");
}

export function applyCatalogQualityDismissals<T extends {
  report: CatalogQualityReport | null;
  reviewQueue: CatalogReviewQueue | null;
}>(snapshot: T, dismissedKeys: ReadonlySet<string>): T & { dismissedCount: number } {
  if (dismissedKeys.size === 0) return { ...snapshot, dismissedCount: 0 };

  let dismissedCount = 0;
  const findings = (snapshot.report?.findings ?? []).filter((finding) => {
    if (!dismissedKeys.has(catalogFindingDismissKey(finding))) return true;
    dismissedCount += 1;
    return false;
  });
  const items = (snapshot.reviewQueue?.items ?? []).filter((item) => {
    if (!dismissedKeys.has(catalogReviewDismissKey(item))) return true;
    dismissedCount += 1;
    return false;
  });

  const report = snapshot.report
    ? {
        ...snapshot.report,
        findings,
        summary: {
          ...snapshot.report.summary,
          errors: findings.filter((f) => f.severity === "error").length,
          warnings: findings.filter((f) => f.severity === "warning").length,
          info: findings.filter((f) => f.severity === "info").length,
        },
      }
    : null;

  const reviewQueue = snapshot.reviewQueue ? { ...snapshot.reviewQueue, items } : null;
  return { ...snapshot, report, reviewQueue, dismissedCount };
}

async function downloadJson<T>(service: SupabaseClient, path: string): Promise<T | null> {
  const { data, error } = await service.storage.from(CATALOG_QUALITY_BUCKET).download(path);
  if (error || !data) return null;
  const text = await data.text();
  return JSON.parse(text) as T;
}

export async function loadCatalogQualitySnapshot(
  service: SupabaseClient,
): Promise<CatalogQualitySnapshot> {
  const prefix = CATALOG_QUALITY_PREFIX;

  const [meta, report, reviewQueue, aiReview, dismissals, parkCountRes, coasterCountRes, syncRes, catalogTouchRes] =
    await Promise.all([
    downloadJson<CatalogQualityMeta>(service, `${prefix}/meta.json`),
    downloadJson<CatalogQualityReport>(service, `${prefix}/report.json`),
    downloadJson<CatalogReviewQueue>(service, `${prefix}/review-queue.json`),
    downloadJson<CatalogAiReview>(service, `${prefix}/ai-review.json`),
    downloadJson<CatalogQualityDismissals>(service, CATALOG_QUALITY_DISMISSALS_PATH),
    service.from("parks").select("id", { count: "exact", head: true }),
    service.from("coasters").select("id", { count: "exact", head: true }),
    service
      .from("sync_runs")
      .select("source,status,started_at,finished_at,records_updated,error")
      .eq("source", CATALOG_SYNC_SOURCE)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("parks")
      .select("last_synced_at")
      .not("last_synced_at", "is", null)
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const dbCounts =
    parkCountRes.count != null && coasterCountRes.count != null
      ? { parks: parkCountRes.count, coasters: coasterCountRes.count }
      : null;

  const catalogTouchedAt = catalogTouchRes.data?.last_synced_at
    ? String(catalogTouchRes.data.last_synced_at)
    : null;
  const lastSync = syncRes.data
    ? {
        source: CATALOG_SYNC_SOURCE,
        status: String(syncRes.data.status),
        started_at: String(syncRes.data.started_at),
        finished_at: syncRes.data.finished_at ? String(syncRes.data.finished_at) : null,
        records_updated: Number(syncRes.data.records_updated ?? 0),
        error: syncRes.data.error ? String(syncRes.data.error) : null,
      }
    : catalogTouchedAt
      ? {
          source: CATALOG_SYNC_SOURCE,
          status: "updated",
          started_at: catalogTouchedAt,
          finished_at: catalogTouchedAt,
          records_updated: 0,
          error: null,
        }
      : null;

  if (!meta && !report) {
    return {
      available: false,
      meta: null,
      report: null,
      reviewQueue: null,
      aiReview: null,
      reviewCounts: {},
      dismissedCount: 0,
      dbCounts,
      lastSync,
      error:
        "No catalog quality report published yet. Run npm run analyze:supabase && npm run publish in coastertrak-data.",
    };
  }

  const dismissedKeys = new Set(dismissals?.keys ?? []);
  const filtered = applyCatalogQualityDismissals({ report, reviewQueue }, dismissedKeys);
  const items = filtered.reviewQueue?.items ?? [];
  const reviewCounts: Record<string, number> = {};
  for (const item of items) {
    const key = item.type.toLowerCase();
    reviewCounts[key] = (reviewCounts[key] ?? 0) + 1;
  }

  return {
    available: true,
    meta,
    report: filtered.report,
    reviewQueue: filtered.reviewQueue,
    aiReview,
    reviewCounts,
    dismissedCount: filtered.dismissedCount,
    dbCounts,
    lastSync,
  };
}
