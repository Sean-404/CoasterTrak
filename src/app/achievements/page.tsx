"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import {
  ACHIEVEMENT_COUNT,
  type AchievementEval,
  type AchievementRide,
  evaluateAchievements,
  sortAchievementsForDisplay,
} from "@/lib/achievements";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useUnits } from "@/components/providers";
import { fmtDuration, fmtHeight, fmtLength, type Units } from "@/lib/units";

type RideRow = AchievementRide;

function formatPair(id: string, current: number, target: number, units: Units): string {
  if (id === "duration_hour") {
    const c = fmtDuration(current) ?? `${Math.round(current)}s`;
    const t = fmtDuration(target) ?? `${target}s`;
    return `${c} / ${t}`;
  }
  if (id === "length_mile") {
    const c = fmtLength(current, units) ?? `${Math.round(current)}`;
    const t = fmtLength(target, units) ?? `${target}`;
    return `${c} / ${t}`;
  }
  if (id === "height_200") {
    const c = fmtHeight(current, units) ?? `${Math.round(current)}`;
    const t = fmtHeight(target, units) ?? `${target}`;
    return `${c} / ${t}`;
  }
  return `${Math.round(current).toLocaleString()} / ${Math.round(target).toLocaleString()}`;
}

function progressPercent(a: AchievementEval): number {
  if (a.target <= 0) return a.unlocked ? 100 : 0;
  return Math.min(100, (a.current / a.target) * 100);
}

export default function AchievementsPage() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const { units } = useUnits();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!data.user) {
          setLoading(false);
          return;
        }

        const ridesRes = await supabase
          .from("rides")
          .select(
            "coaster_id, coasters(park_id, name, wikidata_id, coaster_type, manufacturer, length_ft, speed_mph, height_ft, inversions, duration_s, parks(name, country))",
          )
          .eq("user_id", data.user.id);

        if (ridesRes.error) setFetchError(true);
        setRides((ridesRes.data ?? []) as unknown as RideRow[]);
        setLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setLoading(false);
      });
  }, []);

  const uniqueRides = useMemo(() => {
    const seen = new Set<number>();
    return rides.filter((r) => {
      if (seen.has(r.coaster_id)) return false;
      seen.add(r.coaster_id);
      return true;
    });
  }, [rides]);

  const sorted = useMemo(() => {
    const evals = evaluateAchievements(uniqueRides);
    return sortAchievementsForDisplay(evals);
  }, [uniqueRides]);

  const unlockedCount = useMemo(() => sorted.filter((a) => a.unlocked).length, [sorted]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <AuthGate>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">Achievements</h1>
          <p className="mb-6 max-w-2xl text-sm text-slate-600">
            Credits are self-reported for fun — there is no verification. Progress uses catalog data where available (length,
            height, duration may be missing until enriched).
          </p>

          {fetchError && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              Something went wrong loading your data. Please refresh the page.
            </p>
          )}

          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Unlocked</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {loading ? <span className="text-slate-300">&mdash;</span> : `${unlockedCount} / ${ACHIEVEMENT_COUNT}`}
            </p>
          </div>

          <ul className="space-y-3">
            {loading ? (
              <li className="text-sm text-slate-400">Loading&hellip;</li>
            ) : (
              sorted.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-xl border p-5 shadow-sm ${
                    a.unlocked ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {a.unlocked ? (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-900">
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        ) : (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-300">
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                              <path
                                fillRule="evenodd"
                                d="M5 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2V9z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        )}
                        <h2 className="font-semibold text-slate-900">{a.title}</h2>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-600">{a.description}</p>
                      {a.dataNote && <p className="mt-1 text-xs text-slate-400">{a.dataNote}</p>}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        a.unlocked ? "bg-amber-200 text-slate-900" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {a.unlocked ? "Unlocked" : "Locked"}
                    </span>
                  </div>

                  {!a.unlocked && (
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-slate-500">
                        <span>Progress</span>
                        <span className="tabular-nums">{formatPair(a.id, a.current, a.target, units)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-[width]"
                          style={{ width: `${progressPercent(a)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </AuthGate>
      </main>
    </div>
  );
}
