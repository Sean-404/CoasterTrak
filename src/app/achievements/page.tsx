"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import {
  ACHIEVEMENT_COUNT,
  achievementRarityLabel,
  type AchievementEval,
  type AchievementListSort,
  type AchievementRide,
  type AchievementVisibilityFilter,
  evaluateAchievementsWithUnlockTimes,
  filterAndSortAchievements,
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

function formatUnlockedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const VIEW_OPTIONS: { value: AchievementVisibilityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unlocked", label: "Unlocked" },
  { value: "locked", label: "Locked" },
];

const ORDER_OPTIONS: {
  value: AchievementListSort;
  label: string;
  title: string;
}[] = [
  {
    value: "unlocked-first",
    label: "Default",
    title: "Unlocked first, then closest to completion for the rest",
  },
  {
    value: "locked-first",
    label: "In progress",
    title: "Locked achievements first—closest to done at the top",
  },
  { value: "alpha", label: "A–Z", title: "Alphabetical by title" },
  {
    value: "rarity-desc",
    label: "Rarest first",
    title: "Legendary and epic achievements first, then by title",
  },
  {
    value: "rarity-asc",
    label: "Most common first",
    title: "Common and uncommon achievements first, then by title",
  },
  {
    value: "unlock-newest",
    label: "Newest unlock",
    title: "Most recently unlocked first (then locked by progress)",
  },
  {
    value: "unlock-oldest",
    label: "Oldest unlock",
    title: "Earliest unlocks first (then locked by progress)",
  },
];

function isUnlockDateSort(sort: AchievementListSort): boolean {
  return sort === "unlock-newest" || sort === "unlock-oldest";
}

function isInProgressSort(sort: AchievementListSort): boolean {
  return sort === "locked-first";
}

/**
 * Coerce sort for the current filter without mutating stored `listSort`
 * (so switching tabs restores the user’s previous choice when it applies again).
 */
function effectiveSortForFilter(
  filter: AchievementVisibilityFilter,
  sort: AchievementListSort,
): AchievementListSort {
  if (filter === "locked" && isUnlockDateSort(sort)) return "locked-first";
  if (filter === "unlocked" && isInProgressSort(sort)) return "unlocked-first";
  return sort;
}

export default function AchievementsPage() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [fetchError, setFetchError] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<AchievementVisibilityFilter>("all");
  const [listSort, setListSort] = useState<AchievementListSort>("unlocked-first");
  const { units } = useUnits();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

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
            "coaster_id, ridden_at, coasters(park_id, name, wikidata_id, coaster_type, manufacturer, length_ft, speed_mph, height_ft, inversions, duration_s, parks(name, country))",
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

  const achievementEvals = useMemo(() => evaluateAchievementsWithUnlockTimes(rides), [rides]);

  const sortApplied = useMemo(
    () => effectiveSortForFilter(visibilityFilter, listSort),
    [visibilityFilter, listSort],
  );

  const orderOptionsVisible = useMemo(() => {
    if (visibilityFilter === "locked") {
      return ORDER_OPTIONS.filter((o) => !isUnlockDateSort(o.value));
    }
    if (visibilityFilter === "unlocked") {
      return ORDER_OPTIONS.filter((o) => !isInProgressSort(o.value));
    }
    return ORDER_OPTIONS;
  }, [visibilityFilter]);

  const sorted = useMemo(
    () => filterAndSortAchievements(achievementEvals, visibilityFilter, sortApplied),
    [achievementEvals, visibilityFilter, sortApplied],
  );

  const unlockedCount = useMemo(
    () => achievementEvals.filter((a) => a.unlocked).length,
    [achievementEvals],
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <AuthGate>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">Achievements</h1>
          <p className="mb-6 max-w-2xl text-sm text-slate-600">
            Achievements are self-reported for fun — there is no verification. Every coaster you log counts toward achievements,
            including family and kiddie rides (your Stats page can optionally hide those for a thrill-focused count).
            Progress uses catalog data where available (length, height, duration may be missing).
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

          <div
            className="mb-6 rounded-xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm"
            role="region"
            aria-label="List view options"
          >
            <div className="flex flex-col gap-4">
              <div>
                <p id="achievements-view-label" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Show
                </p>
                <div
                  className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
                  role="group"
                  aria-labelledby="achievements-view-label"
                >
                  {VIEW_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setVisibilityFilter(value)}
                      aria-pressed={visibilityFilter === value}
                      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        visibilityFilter === value
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label
                  htmlFor="achievements-order"
                  id="achievements-order-label"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Order
                </label>
                <select
                  id="achievements-order"
                  className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                  aria-labelledby="achievements-order-label"
                  value={sortApplied}
                  title={
                    orderOptionsVisible.find((o) => o.value === sortApplied)?.title ??
                    orderOptionsVisible[0]?.title
                  }
                  onChange={(e) => setListSort(e.target.value as AchievementListSort)}
                >
                  {orderOptionsVisible.map(({ value, label, title }) => (
                    <option key={value} value={value} title={title}>
                      {label}
                    </option>
                  ))}
                </select>
                {visibilityFilter === "locked" ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Sort by unlock date is available when you show <span className="font-medium text-slate-600">All</span>{" "}
                    or <span className="font-medium text-slate-600">Unlocked</span>.
                  </p>
                ) : visibilityFilter === "unlocked" ? (
                  <p className="mt-2 text-xs text-slate-500">
                    &ldquo;In progress&rdquo; order is available when you show <span className="font-medium text-slate-600">All</span>{" "}
                    or <span className="font-medium text-slate-600">Locked</span>.
                  </p>
                ) : null}
              </div>
            </div>
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
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-500">
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden>
                              <path
                                d="M6.5 9V7.5a3.5 3.5 0 117 0V9"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                              />
                              <rect
                                x="5.25"
                                y="9"
                                width="9.5"
                                height="7.5"
                                rx="1.8"
                                stroke="currentColor"
                                strokeWidth="1.7"
                              />
                            </svg>
                          </span>
                        )}
                        <h2 className="font-semibold text-slate-900">{a.title}</h2>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-600">{a.description}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <span className="text-xs text-slate-500">{achievementRarityLabel(a.rarity)}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          a.unlocked ? "bg-amber-200 text-slate-900" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {a.unlocked ? "Unlocked" : "Locked"}
                      </span>
                      {a.unlocked ? (
                        <span className="text-[11px] text-slate-500">
                          {formatUnlockedAt(a.unlockedAt) ?? "Date unknown"}
                        </span>
                      ) : null}
                    </div>
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
