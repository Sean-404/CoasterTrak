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
import type { AdminCatalogCoasterDetail } from "@/app/api/admin/data/catalog/coasters/[id]/route";

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

async function adminFetch<T extends object>(path: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not signed in.");
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
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

function formatFieldLabel(field: string): string {
  return field.replace(/_/g, " ");
}

function resolveInspectId(item: CatalogReviewItem): number | null {
  if (typeof item.dbId === "number" && item.dbId > 0) return item.dbId;
  if (item.entityType === "coaster" && item.entityId) {
    const m = item.entityId.match(/(?:^|_)(?:db_)?(\d+)$/i) ?? item.entityId.match(/-(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function FieldValue({ label, value }: { label: string; value: string | number | null | undefined }) {
  const empty = value == null || value === "";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm ${empty ? "text-amber-700" : "text-slate-900"}`}>
        {empty ? "Missing" : String(value)}
      </p>
    </div>
  );
}

export default function AdminCatalogQualityPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [filter, setFilter] = useState<ReviewFilter>("findings");
  const [snapshot, setSnapshot] = useState<CatalogQualitySnapshot | null>(null);
  const [topFindings, setTopFindings] = useState<CatalogQualityFinding[]>([]);
  const [reviewItems, setReviewItems] = useState<CatalogReviewItem[]>([]);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<AdminCatalogCoasterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async (nextFilter: ReviewFilter) => {
    setError("");
    try {
      const params = new URLSearchParams({ limit: nextFilter === "missing" ? "250" : "150" });
      if (nextFilter !== "findings") {
        params.set(
          "reviewType",
          nextFilter === "all" ? "possible_duplicate" : nextFilter,
        );
      }
      // "all" should mean all review items — keep existing API quirk for non-findings
      if (nextFilter === "all") {
        params.delete("reviewType");
        const payload = await adminFetch<
          CatalogQualitySnapshot & {
            topFindings?: CatalogQualityFinding[];
            reviewItems?: CatalogReviewItem[];
          }
        >(`/api/admin/data/catalog?${params}`);
        setSnapshot(payload);
        setTopFindings(payload.topFindings ?? []);
        setReviewItems(payload.reviewQueue?.items.slice(0, 250) ?? []);
        return;
      }
      const payload = await adminFetch<
        CatalogQualitySnapshot & {
          topFindings?: CatalogQualityFinding[];
          reviewItems?: CatalogReviewItem[];
        }
      >(`/api/admin/data/catalog?${params}`);
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

  const openDetail = useCallback(async (coasterId: number) => {
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    try {
      const payload = await adminFetch<AdminCatalogCoasterDetail>(
        `/api/admin/data/catalog/coasters/${coasterId}`,
      );
      setDetail(payload);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Could not load coaster.");
    } finally {
      setDetailLoading(false);
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
                ? topFindings.map((f, i) => {
                    const details = f.details as { dbId?: number } | undefined;
                    const dbId =
                      typeof details?.dbId === "number"
                        ? details.dbId
                        : f.entityType === "coaster"
                          ? resolveInspectId({
                              type: "MISSING_DATA",
                              entityType: "coaster",
                              entityId: f.entityId,
                              entityName: f.entityName ?? "",
                              field: "x",
                              reason: "",
                              action: "REVIEW",
                            })
                          : null;
                    return (
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
                        {dbId ? (
                          <button
                            type="button"
                            onClick={() => void openDetail(dbId)}
                            className="mt-2 text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
                          >
                            Inspect ride
                          </button>
                        ) : null}
                      </div>
                    );
                  })
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
                  : reviewItems.map((item, i) => {
                      const inspectId = resolveInspectId(item);
                      const fields = item.fields?.length
                        ? item.fields
                        : item.field
                          ? [item.field]
                          : [];
                      return (
                        <div
                          key={`${item.type}-${item.entityId ?? item.entityA ?? i}`}
                          className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
                        >
                          <p className="font-semibold text-slate-900">
                            {item.type.replace(/_/g, " ")}
                          </p>
                          {item.type === "POSSIBLE_DUPLICATE" ? (
                            <p className="mt-1 text-slate-700">
                              {item.nameA} / {item.nameB}
                              {item.confidence ? ` · ${item.confidence}` : ""}
                            </p>
                          ) : null}
                          {item.entityName ? (
                            <p className="mt-1 text-slate-700">
                              {item.entityName}
                              {item.parkName ? ` · ${item.parkName}` : ""}
                            </p>
                          ) : null}
                          {item.reason ? (
                            <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                          ) : null}
                          {fields.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {fields.map((field) => (
                                <span
                                  key={field}
                                  className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900"
                                >
                                  {formatFieldLabel(field)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {item.reasons?.length ? (
                            <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
                              {item.reasons.map((r) => (
                                <li key={r}>{r}</li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
                            {inspectId ? (
                              <button
                                type="button"
                                onClick={() => void openDetail(inspectId)}
                                className="text-amber-800 underline-offset-2 hover:underline"
                              >
                                Inspect ride
                              </button>
                            ) : null}
                            {item.publicPath ? (
                              <Link
                                href={item.publicPath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-600 underline-offset-2 hover:underline"
                              >
                                Open public page
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

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

      {(detail || detailLoading || detailError) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 p-0 sm:p-4">
          <button
            type="button"
            aria-label="Close ride detail"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              setDetail(null);
              setDetailError("");
            }}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Ride detail
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  {detail?.display.name ?? (detailLoading ? "Loading…" : "Ride")}
                </h2>
                {detail?.park ? (
                  <p className="mt-0.5 text-sm text-slate-500">
                    {detail.park.name}
                    {detail.park.country ? ` · ${detail.park.country}` : ""}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setDetailError("");
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:border-slate-300"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {detailLoading ? (
                <p className="text-sm text-slate-500">Loading live DB row…</p>
              ) : detailError ? (
                <p className="text-sm text-red-600">{detailError}</p>
              ) : detail ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-3 text-xs font-semibold">
                    <Link
                      href={detail.publicPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-800 underline-offset-2 hover:underline"
                    >
                      Public page
                    </Link>
                    {detail.parkPublicPath ? (
                      <Link
                        href={detail.parkPublicPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 underline-offset-2 hover:underline"
                      >
                        Park page
                      </Link>
                    ) : null}
                    {detail.wikidataUrl ? (
                      <a
                        href={detail.wikidataUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 underline-offset-2 hover:underline"
                      >
                        Wikidata
                      </a>
                    ) : null}
                    {detail.wikipediaUrl ? (
                      <a
                        href={detail.wikipediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 underline-offset-2 hover:underline"
                      >
                        Wikipedia
                      </a>
                    ) : null}
                  </div>

                  {detail.missingFields.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Still empty
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {detail.missingFields.map((field) => (
                          <span
                            key={field}
                            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900"
                          >
                            {formatFieldLabel(field)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-emerald-700">Core completeness fields are filled.</p>
                  )}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Display (after known fixes)
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <FieldValue label="Type" value={detail.display.coasterType} />
                      <FieldValue label="Manufacturer" value={detail.display.manufacturer} />
                      <FieldValue label="Status" value={detail.display.status} />
                      <FieldValue label="Height ft" value={detail.display.heightFt} />
                      <FieldValue label="Speed mph" value={detail.display.speedMph} />
                      <FieldValue label="Length ft" value={detail.display.lengthFt} />
                      <FieldValue label="Opened" value={detail.display.openingYear} />
                      <FieldValue label="Closed" value={detail.display.closingYear} />
                    </div>
                    {detail.knownFixApplied ? (
                      <p className="mt-2 text-xs text-amber-800">
                        A known-fix overlay changes at least one display field vs the raw DB row.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Raw database row
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <FieldValue label="ID" value={detail.coaster.id} />
                      <FieldValue label="Park ID" value={detail.coaster.park_id} />
                      <FieldValue label="Name" value={detail.coaster.name} />
                      <FieldValue label="Wikidata" value={detail.coaster.wikidata_id} />
                      <FieldValue label="RCDB" value={detail.coaster.rcdb_id} />
                      <FieldValue label="External" value={detail.coaster.external_id} />
                      <FieldValue label="Type" value={detail.coaster.coaster_type} />
                      <FieldValue label="Manufacturer" value={detail.coaster.manufacturer} />
                      <FieldValue label="Status" value={detail.coaster.status} />
                      <FieldValue label="Height ft" value={detail.coaster.height_ft} />
                      <FieldValue label="Speed mph" value={detail.coaster.speed_mph} />
                      <FieldValue label="Length ft" value={detail.coaster.length_ft} />
                      <FieldValue label="Duration s" value={detail.coaster.duration_s} />
                      <FieldValue label="Inversions" value={detail.coaster.inversions} />
                      <FieldValue label="Opened" value={detail.coaster.opening_year} />
                      <FieldValue label="Closed" value={detail.coaster.closing_year} />
                      <FieldValue label="Image" value={detail.coaster.image_url} />
                      <FieldValue label="Enwiki" value={detail.coaster.enwiki_title} />
                      <FieldValue label="Synced" value={formatWhen(detail.coaster.last_synced_at)} />
                    </div>
                    {detail.coaster.summary_text ? (
                      <p className="mt-3 text-xs leading-relaxed text-slate-600">
                        {detail.coaster.summary_text}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Field overrides
                    </p>
                    {detail.overrides.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">No DB field overrides.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {detail.overrides.map((o) => (
                          <li
                            key={`${o.fieldName}-${o.source ?? ""}`}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          >
                            <p className="font-semibold text-slate-900">{o.fieldName}</p>
                            <p className="text-slate-700">
                              {o.valueText ?? o.valueInt ?? "—"}
                              {o.approved === false ? " · not approved" : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              {[o.source, o.sourceUrl].filter(Boolean).join(" · ") || "No source"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
