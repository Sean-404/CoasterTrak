"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppPageHeading } from "@/components/app-page-heading";
import { SiteHeader } from "@/components/site-header";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import type {
  CatalogQualityFinding,
  CatalogQualitySnapshot,
  CatalogReviewItem,
} from "@/app/api/admin/data/catalog/route";

type ReviewFilter = "all" | "duplicates" | "country" | "suspicious" | "missing" | "findings" | "ai";

const REVIEW_FILTERS: Array<{ key: ReviewFilter; label: string }> = [
  { key: "findings", label: "Top findings" },
  { key: "ai", label: "AI flagged" },
  { key: "duplicates", label: "Duplicates" },
  { key: "country", label: "Country conflicts" },
  { key: "suspicious", label: "Suspicious values" },
  { key: "missing", label: "Missing data" },
  { key: "all", label: "All review items" },
];

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function adminFetch(path: string) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not signed in.");
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json().catch(() => ({}))) as CatalogQualitySnapshot & {
    error?: string;
    topFindings?: CatalogQualityFinding[];
    reviewItems?: CatalogReviewItem[];
  };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function severityClass(severity: string): string {
  if (severity === "error") return "text-red-700 bg-red-50 border-red-200";
  if (severity === "warning") return "text-amber-800 bg-amber-50 border-amber-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

export default function AdminCatalogQualityPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [filter, setFilter] = useState<ReviewFilter>("findings");
  const [snapshot, setSnapshot] = useState<CatalogQualitySnapshot | null>(null);
  const [topFindings, setTopFindings] = useState<CatalogQualityFinding[]>([]);
  const [reviewItems, setReviewItems] = useState<CatalogReviewItem[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async (nextFilter: ReviewFilter) => {
    setError("");
    try {
      const params = new URLSearchParams({ limit: "150" });
      if (nextFilter !== "findings") {
        params.set(
          "reviewType",
          nextFilter === "all" ? "possible_duplicate" : nextFilter,
        );
      }
      const payload = await adminFetch(`/api/admin/data/catalog?${params}`);
      setSnapshot(payload);
      setTopFindings(payload.topFindings ?? []);
      setReviewItems(
        payload.reviewItems ??
          (nextFilter === "findings" ? [] : payload.reviewQueue?.items.slice(0, 150) ?? []),
      );
    } catch (err) {
      setSnapshot(null);
      setTopFindings([]);
      setReviewItems([]);
      setError(err instanceof Error ? err.message : "Could not load catalog quality data.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getSupabaseUserSafe().then((user) => {
      if (cancelled) return;
      const isAdmin = isAdminUser(user);
      setAllowed(isAdmin);
      setLoading(false);
      if (isAdmin) void load(filter);
    });
    return () => {
      cancelled = true;
    };
  }, [filter, load]);

  const summary = snapshot?.report?.summary;
  const aiFlagged =
    snapshot?.aiReview?.assessments.filter(
      (a) => !a.plausible && (a.confidence === "MEDIUM" || a.confidence === "HIGH"),
    ) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <AppPageHeading>Catalog quality</AppPageHeading>
            <p className="mt-1 text-sm text-slate-500">
              Read-only view of the coastertrak-data pipeline report (Supabase catalog analysis).
            </p>
          </div>
          <div className="flex gap-3 text-sm font-semibold">
            <Link href="/admin/data" className="text-amber-700 hover:underline">
              ThemeParks review
            </Link>
            <Link href="/admin" className="text-amber-700 hover:underline">
              ← Admin
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : !allowed ? (
          <p className="mt-8 text-sm text-slate-600">Admin access required.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {snapshot?.error && !snapshot.available ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {snapshot.error}
                <p className="mt-2 text-xs text-amber-800">
                  From the coastertrak-data repo:{" "}
                  <code className="rounded bg-white/70 px-1">
                    npm run analyze:supabase && npm run publish
                  </code>
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Live database
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {snapshot?.dbCounts
                    ? `${snapshot.dbCounts.parks.toLocaleString()} parks · ${snapshot.dbCounts.coasters.toLocaleString()} coasters`
                    : "—"}
                </p>
                {snapshot?.lastSync ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Last sync ({snapshot.lastSync.source}):{" "}
                    {snapshot.lastSync.status} · {formatWhen(snapshot.lastSync.started_at)}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quality report
                </p>
                {summary ? (
                  <>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {summary.errors} errors · {summary.warnings} warnings
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Analyzed {formatWhen(snapshot?.meta?.generatedAt ?? snapshot?.report?.generatedAt)}
                      {snapshot?.meta?.source ? ` · ${snapshot.meta.source}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No report published</p>
                )}
              </div>
            </div>

            {snapshot?.aiReview ? (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  AI review
                </p>
                <p className="mt-2 text-sm text-violet-950">
                  {snapshot.aiReview.itemsReviewed} items · {aiFlagged.length} flagged · ~
                  ${snapshot.aiReview.estimatedCostUsd.toFixed(4)} · {snapshot.aiReview.model}
                </p>
                <p className="mt-1 text-xs text-violet-800">
                  Run {formatWhen(snapshot.aiReview.generatedAt)}
                </p>
              </div>
            ) : null}

            {snapshot?.reviewCounts && Object.keys(snapshot.reviewCounts).length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Review queue
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(snapshot.reviewCounts).map(([type, count]) => (
                    <span
                      key={type}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      {type.replace(/_/g, " ")}: {count}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {REVIEW_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filter === f.key
                      ? "bg-amber-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-amber-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filter === "findings"
                ? topFindings.map((f, i) => (
                    <div
                      key={`${f.code}-${f.entityId ?? i}`}
                      className={`rounded-xl border p-3 text-sm ${severityClass(f.severity)}`}
                    >
                      <p className="font-semibold">{f.message}</p>
                      {f.entityName ? (
                        <p className="mt-1 text-xs opacity-80">
                          {f.entityName}
                          {f.entityId ? ` (${f.entityId})` : ""}
                        </p>
                      ) : null}
                    </div>
                  ))
                : filter === "ai"
                  ? aiFlagged.map((a, i) => (
                      <div
                        key={`${a.itemKey}-${i}`}
                        className="rounded-xl border border-violet-200 bg-white p-3 text-sm shadow-sm"
                      >
                        <p className="font-semibold text-violet-900">
                          Likely issue · {a.confidence}
                        </p>
                        <p className="mt-1 text-slate-800">{a.issue}</p>
                        {a.suggestedAction ? (
                          <p className="mt-1 text-xs text-slate-500">{a.suggestedAction}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-400">{a.itemKey}</p>
                      </div>
                    ))
                  : reviewItems.map((item, i) => (
                    <div
                      key={`${item.type}-${item.entityId ?? item.entityA ?? i}`}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
                    >
                      <p className="font-semibold text-slate-900">{item.type.replace(/_/g, " ")}</p>
                      {item.type === "POSSIBLE_DUPLICATE" ? (
                        <p className="mt-1 text-slate-700">
                          {item.nameA} / {item.nameB}
                          {item.confidence ? ` · ${item.confidence}` : ""}
                        </p>
                      ) : null}
                      {item.entityName ? (
                        <p className="mt-1 text-slate-700">{item.entityName}</p>
                      ) : null}
                      {item.reason ? <p className="mt-1 text-xs text-slate-500">{item.reason}</p> : null}
                      {item.reasons?.length ? (
                        <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
                          {item.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}

              {filter === "findings" && topFindings.length === 0 ? (
                <p className="text-sm text-slate-500">No findings in the published report.</p>
              ) : null}
              {filter === "ai" && aiFlagged.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No AI review published yet, or nothing flagged. Run{" "}
                  <code className="text-xs">npm run ai:review && npm run publish</code> in
                  coastertrak-data.
                </p>
              ) : null}
              {filter !== "findings" && filter !== "ai" && reviewItems.length === 0 ? (
                <p className="text-sm text-slate-500">No items for this filter.</p>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
