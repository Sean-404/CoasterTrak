"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { isAdminUser } from "@/lib/admin";
import { isCoasterDefunct } from "@/lib/coaster-status";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import type { DataFindingRow, FindingTypeCount } from "@/app/api/admin/data/findings/route";

type FilterKey =
  | "actionable"
  | "name_mismatch_candidate"
  | "park_match_candidate"
  | "source_attraction_unmatched"
  | "local_coaster_missing_in_source"
  | "park_unmapped"
  | "all";

const FILTERS: Array<{ key: FilterKey; label: string; hint: string }> = [
  { key: "actionable", label: "Actionable", hint: "Name mismatches + park match candidates" },
  { key: "name_mismatch_candidate", label: "Name mismatches", hint: "Save aliases here" },
  { key: "park_match_candidate", label: "Park matches", hint: "Suggested ThemeParks park links" },
  { key: "source_attraction_unmatched", label: "Unmatched attractions", hint: "ThemeParks rides we could not map" },
  { key: "local_coaster_missing_in_source", label: "Missing in ThemeParks", hint: "Catalog rides not found live" },
  { key: "park_unmapped", label: "Unmapped parks", hint: "No ThemeParks park link" },
  { key: "all", label: "All open", hint: "Everything still open" },
];

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function adminFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not signed in.");
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    findings?: DataFindingRow[];
    counts?: FindingTypeCount[];
    totalOpen?: number;
    ignored?: number;
  };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function detailName(detail: Record<string, unknown>, key: string): string {
  const v = detail[key];
  return typeof v === "string" ? v : "";
}

function countFor(counts: FindingTypeCount[], type: string): number {
  return counts.find((c) => c.finding_type === type)?.count ?? 0;
}

function filterCount(counts: FindingTypeCount[], key: FilterKey): number {
  if (key === "all") return counts.reduce((sum, c) => sum + c.count, 0);
  if (key === "actionable") {
    return (
      countFor(counts, "name_mismatch_candidate") + countFor(counts, "park_match_candidate")
    );
  }
  return countFor(counts, key);
}

export default function AdminDataPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("actionable");
  const [findings, setFindings] = useState<DataFindingRow[]>([]);
  const [counts, setCounts] = useState<FindingTypeCount[]>([]);
  const [totalOpen, setTotalOpen] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadFindings = useCallback(async (nextFilter: FilterKey) => {
    setError("");
    try {
      const params = new URLSearchParams({
        status: "open",
        type: nextFilter,
        counts: "1",
        limit: "200",
      });
      const payload = await adminFetch(`/api/admin/data/findings?${params}`);
      setFindings(payload.findings ?? []);
      setCounts(payload.counts ?? []);
      setTotalOpen(payload.totalOpen ?? 0);
    } catch (err) {
      setFindings([]);
      setCounts([]);
      setTotalOpen(0);
      setError(err instanceof Error ? err.message : "Could not load findings.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getSupabaseUserSafe().then((user) => {
      if (cancelled) return;
      const isAdmin = isAdminUser(user);
      setAllowed(isAdmin);
      setLoading(false);
      if (isAdmin) void loadFindings(filter);
    });
    return () => {
      cancelled = true;
    };
  }, [filter, loadFindings]);

  async function onFilterChange(next: FilterKey) {
    setFilter(next);
    setMessage("");
  }

  async function act(findingId: number, body: Record<string, unknown>) {
    setBusyId(findingId);
    setError("");
    setMessage("");
    try {
      await adminFetch(`/api/admin/data/findings/${findingId}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setFindings((rows) => rows.filter((r) => r.id !== findingId));
      setCounts((prev) => {
        const row = findings.find((f) => f.id === findingId);
        if (!row) return prev;
        return prev.map((c) =>
          c.finding_type === row.finding_type ? { ...c, count: Math.max(0, c.count - 1) } : c,
        );
      });
      setTotalOpen((n) => Math.max(0, n - 1));
      setMessage("Updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkIgnoreNoise() {
    if (
      !window.confirm(
        "Ignore all unmapped parks plus defunct catalog rides missing from ThemeParks? This clears expected coverage noise.",
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await adminFetch("/api/admin/data/findings", {
        method: "POST",
        body: JSON.stringify({ action: "bulk_ignore", preset: "noise" }),
      });
      setMessage(`Ignored ${payload.ignored ?? 0} noisy finding(s).`);
      await loadFindings(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk ignore failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkIgnoreCurrentType() {
    if (filter === "all" || filter === "actionable" || filter === "name_mismatch_candidate") {
      setError("Switch to a single noise type (e.g. Unmapped parks) before bulk-ignoring.");
      return;
    }
    if (!window.confirm(`Ignore all open “${filter.replace(/_/g, " ")}” findings?`)) return;
    setBulkBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await adminFetch("/api/admin/data/findings", {
        method: "POST",
        body: JSON.stringify({ action: "bulk_ignore", types: [filter] }),
      });
      setMessage(`Ignored ${payload.ignored ?? 0} finding(s).`);
      await loadFindings(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk ignore failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  const noiseEstimate = useMemo(() => {
    const unmapped = countFor(counts, "park_unmapped");
    const missing = findings.filter(
      (f) =>
        f.finding_type === "local_coaster_missing_in_source" &&
        f.coasters &&
        isCoasterDefunct({
          status: f.coasters.status ?? "Unknown",
          closing_year: f.coasters.closing_year,
        }),
    ).length;
    return { unmapped, missingShown: missing };
  }, [counts, findings]);

  const activeHint = FILTERS.find((f) => f.key === filter)?.hint ?? "";

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Data review</h1>
            <p className="mt-1 text-sm text-slate-500">
              ThemeParks.wiki match queue — start with aliases, then clear expected noise.
            </p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-amber-700 hover:underline">
            ← Admin
          </Link>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : !allowed ? (
          <p className="mt-8 text-sm text-slate-600">Admin access required.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {totalOpen.toLocaleString()} open total
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {FILTERS.map((f) => {
                  const n = filterCount(counts, f.key);
                  const active = filter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => void onFilterChange(f.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-amber-300 bg-amber-100 text-amber-950"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {f.label} ({n})
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">{activeHint}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void bulkIgnoreNoise()}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  Clear expected noise
                </button>
                {filter === "park_unmapped" ||
                filter === "local_coaster_missing_in_source" ||
                filter === "source_attraction_unmatched" ? (
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void bulkIgnoreCurrentType()}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Ignore all in this filter
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Noise clearer ignores all unmapped parks ({noiseEstimate.unmapped}) plus defunct rides
                missing from ThemeParks.
              </p>
            </div>

            <p className="text-xs text-slate-500">
              Showing {findings.length} finding{findings.length === 1 ? "" : "s"}
              {findings.length >= 200 ? " (capped at 200)" : ""}
            </p>

            {findings.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                Nothing in this filter. Try another tab, or run{" "}
                <code className="rounded bg-slate-100 px-1">npm run data:match-themeparks -- --write-db</code>{" "}
                after catalog changes.
              </p>
            ) : (
              <ul className="space-y-3">
                {findings.map((f) => {
                  const parkName = f.parks?.name ?? "Unknown park";
                  const coasterName = f.coasters?.name ?? detailName(f.detail, "coasterName");
                  const feedName = detailName(f.detail, "themeParksName");
                  const isNameMismatch = f.finding_type === "name_mismatch_candidate";
                  const defunct =
                    f.coasters != null &&
                    isCoasterDefunct({
                      status: f.coasters.status ?? "Unknown",
                      closing_year: f.coasters.closing_year,
                    });

                  return (
                    <li
                      key={f.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        [{f.severity}] {f.finding_type.replace(/_/g, " ")}
                        {defunct ? " · defunct" : ""}
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">{f.title}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {parkName}
                        {coasterName ? ` · ${coasterName}` : ""}
                      </p>
                      {isNameMismatch && feedName ? (
                        <p className="mt-1 text-sm text-slate-500">
                          ThemeParks name: <span className="font-medium text-slate-700">{feedName}</span>
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {isNameMismatch && coasterName && feedName ? (
                          <>
                            <button
                              type="button"
                              disabled={busyId === f.id}
                              onClick={() =>
                                void act(f.id, {
                                  action: "save_alias",
                                  catalogName: coasterName,
                                  feedName,
                                  parkId: f.park_id,
                                })
                              }
                              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              Save alias
                            </button>
                            <button
                              type="button"
                              disabled={busyId === f.id}
                              onClick={() =>
                                void act(f.id, { action: "rename_to_feed", feedName })
                              }
                              className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                            >
                              Rename catalog → feed
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === f.id}
                          onClick={() => void act(f.id, { action: "ignore" })}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Ignore
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
