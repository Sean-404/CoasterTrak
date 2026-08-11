"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import type { DataFindingRow } from "@/app/api/admin/data/findings/route";

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
  const payload = (await response.json().catch(() => ({}))) as { error?: string; findings?: DataFindingRow[] };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function detailName(detail: Record<string, unknown>, key: string): string {
  const v = detail[key];
  return typeof v === "string" ? v : "";
}

export default function AdminDataPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [findings, setFindings] = useState<DataFindingRow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadFindings = useCallback(async () => {
    setError("");
    try {
      const payload = await adminFetch("/api/admin/data/findings?status=open");
      setFindings(payload.findings ?? []);
    } catch (err) {
      setFindings([]);
      setError(err instanceof Error ? err.message : "Could not load findings.");
    }
  }, []);

  useEffect(() => {
    void getSupabaseUserSafe().then((user) => {
      const isAdmin = isAdminUser(user);
      setAllowed(isAdmin);
      setLoading(false);
      if (isAdmin) void loadFindings();
    });
  }, [loadFindings]);

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
      setMessage("Updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Data review</h1>
            <p className="mt-1 text-sm text-slate-500">
              ThemeParks.wiki match queue — save aliases instead of editing code.
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
            <p className="text-xs text-slate-500">{findings.length} open finding(s)</p>

            {findings.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                No open findings. Run{" "}
                <code className="rounded bg-slate-100 px-1">npm run data:match-themeparks -- --write-db</code> after
                catalog changes.
              </p>
            ) : (
              <ul className="space-y-3">
                {findings.map((f) => {
                  const parkName = f.parks?.name ?? "Unknown park";
                  const coasterName = f.coasters?.name ?? detailName(f.detail, "coasterName");
                  const feedName = detailName(f.detail, "themeParksName");
                  const isNameMismatch = f.finding_type === "name_mismatch_candidate";

                  return (
                    <li
                      key={f.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        [{f.severity}] {f.finding_type.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">{f.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{parkName}{coasterName ? ` · ${coasterName}` : ""}</p>

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
