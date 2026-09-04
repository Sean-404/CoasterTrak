import type { SupabaseClient } from "@supabase/supabase-js";

export const CATALOG_QUALITY_BUCKET = "catalog";
export const CATALOG_QUALITY_PREFIX = "coastertrak-data/latest";

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

export type CatalogQualitySnapshot = {
  available: boolean;
  meta: CatalogQualityMeta | null;
  report: CatalogQualityReport | null;
  reviewQueue: CatalogReviewQueue | null;
  aiReview: CatalogAiReview | null;
  reviewCounts: Record<string, number>;
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

  const [meta, report, reviewQueue, aiReview, parkCountRes, coasterCountRes, syncRes] = await Promise.all([
    downloadJson<CatalogQualityMeta>(service, `${prefix}/meta.json`),
    downloadJson<CatalogQualityReport>(service, `${prefix}/report.json`),
    downloadJson<CatalogReviewQueue>(service, `${prefix}/review-queue.json`),
    downloadJson<CatalogAiReview>(service, `${prefix}/ai-review.json`),
    service.from("parks").select("id", { count: "exact", head: true }),
    service.from("coasters").select("id", { count: "exact", head: true }),
    service
      .from("sync_runs")
      .select("source,status,started_at,finished_at,records_updated,error")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const dbCounts =
    parkCountRes.count != null && coasterCountRes.count != null
      ? { parks: parkCountRes.count, coasters: coasterCountRes.count }
      : null;

  const lastSync = syncRes.data
    ? {
        source: String(syncRes.data.source),
        status: String(syncRes.data.status),
        started_at: String(syncRes.data.started_at),
        finished_at: syncRes.data.finished_at ? String(syncRes.data.finished_at) : null,
        records_updated: Number(syncRes.data.records_updated ?? 0),
        error: syncRes.data.error ? String(syncRes.data.error) : null,
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
      dbCounts,
      lastSync,
      error:
        "No catalog quality report published yet. Run npm run analyze:supabase && npm run publish in coastertrak-data.",
    };
  }

  const items = reviewQueue?.items ?? [];
  const reviewCounts: Record<string, number> = {};
  for (const item of items) {
    const key = item.type.toLowerCase();
    reviewCounts[key] = (reviewCounts[key] ?? 0) + 1;
  }

  return {
    available: true,
    meta,
    report,
    reviewQueue,
    aiReview,
    reviewCounts,
    dbCounts,
    lastSync,
  };
}
