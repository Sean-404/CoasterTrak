"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { cleanCoasterName, formatParkLabel, matchesSearchQuery } from "@/lib/display";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import { useUnits } from "@/components/providers";
import { fmtLength, fmtHeight, fmtSpeed, fmtDuration } from "@/lib/units";
import { UnitsToggle } from "@/components/units-toggle";
import { isThrillCoaster } from "@/lib/coaster-dedup";

type RideCoaster = {
  id?: number;
  park_id?: number;
  name: string;
  wikidata_id?: string | null;
  coaster_type: string;
  manufacturer: string | null;
  length_ft: number | null;
  speed_mph: number | null;
  height_ft: number | null;
  inversions: number | null;
  /** Ride duration (track time), seconds */
  duration_s: number | null;
  status?: string;
  opening_year?: number | null;
  closing_year?: number | null;
  parks?: { name: string; country: string } | null;
};

type RideRow = {
  coaster_id: number;
  coasters?: RideCoaster | null;
};

export default function StatsPage() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [includeFamilyRides, setIncludeFamilyRides] = useState(false);
  const { units, setUnits } = useUnits();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    void getSupabaseUserSafe().then(async (user) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const ridesRes = await supabase
        .from("rides")
        .select(
          "coaster_id, coasters(name, wikidata_id, coaster_type, manufacturer, length_ft, speed_mph, height_ft, inversions, duration_s, parks(name, country))",
        )
        .eq("user_id", user.id);

      if (ridesRes.error) {
        setFetchError(true);
      }

      const rows = (ridesRes.data ?? []) as unknown as RideRow[];
      setRides(
        rows.map((r) => ({
          ...r,
          coasters: r.coasters ? applyCoasterKnownFixes(r.coasters) : null,
        })),
      );
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

  const filteredUniqueRides = useMemo(() => {
    if (includeFamilyRides) return uniqueRides;
    return uniqueRides.filter((r) => {
      const c = r.coasters;
      if (!c) return false;
      return isThrillCoaster(
        {
          id: c.id ?? r.coaster_id,
          park_id: c.park_id ?? 0,
          name: c.name,
          coaster_type: c.coaster_type,
          manufacturer: c.manufacturer ?? null,
          status: c.status ?? "Operating",
          length_ft: c.length_ft ?? null,
          speed_mph: c.speed_mph ?? null,
          height_ft: c.height_ft ?? null,
          inversions: c.inversions ?? null,
          duration_s: c.duration_s ?? null,
          opening_year: c.opening_year ?? null,
          closing_year: c.closing_year ?? null,
        },
        c.parks?.name ?? null,
      );
    });
  }, [includeFamilyRides, uniqueRides]);

  const countriesVisited = useMemo(
    () => new Set(filteredUniqueRides.map((r) => r.coasters?.parks?.country).filter(Boolean)).size,
    [filteredUniqueRides],
  );

  const parksVisited = useMemo(
    () =>
      new Set(
        filteredUniqueRides
          .map((r) => formatParkLabel(r.coasters?.parks?.name, r.coasters?.parks?.country))
          .filter(Boolean),
      ).size,
    [filteredUniqueRides],
  );

  const topParks = useMemo(() => {
    const counter = new Map<string, number>();
    for (const ride of filteredUniqueRides) {
      const label = formatParkLabel(ride.coasters?.parks?.name, ride.coasters?.parks?.country);
      if (!label) continue;
      counter.set(label, (counter.get(label) ?? 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filteredUniqueRides]);

  /** Unique countries from ridden coasters, with ride counts, most rides first */
  const countriesWithRideCounts = useMemo(() => {
    const counter = new Map<string, number>();
    for (const ride of filteredUniqueRides) {
      const country = ride.coasters?.parks?.country;
      if (!country) continue;
      counter.set(country, (counter.get(country) ?? 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }, [filteredUniqueRides]);

  type RecordEntry = { name: string; park: string; value: number };

  const personalRecords = useMemo(() => {
    function best(
      field: keyof Pick<RideCoaster, "length_ft" | "speed_mph" | "height_ft" | "inversions" | "duration_s">,
    ): RecordEntry | null {
      let top: RecordEntry | null = null;
      for (const r of filteredUniqueRides) {
        const v = r.coasters?.[field];
        if (v == null) continue;
        if (top === null || v > top.value) {
          top = {
            name: cleanCoasterName(r.coasters?.name ?? ""),
            park: formatParkLabel(r.coasters?.parks?.name, r.coasters?.parks?.country),
            value: v,
          };
        }
      }
      return top;
    }
    return {
      longest: best("length_ft"),
      tallest: best("height_ft"),
      fastest: best("speed_mph"),
      mostInversions: best("inversions"),
      longestDuration: best("duration_s"),
    };
  }, [filteredUniqueRides]);

  const hasAnyRecord = Object.values(personalRecords).some(Boolean);

  const [rideFilter, setRideFilter] = useState("");

  const filteredRides = useMemo(() => {
    if (!rideFilter.trim()) return filteredUniqueRides;
    return filteredUniqueRides.filter((r) => {
      const c = r.coasters;
      return (
        matchesSearchQuery(cleanCoasterName(c?.name ?? ""), rideFilter) ||
        matchesSearchQuery(c?.parks?.name ?? "", rideFilter) ||
        matchesSearchQuery(c?.parks?.country ?? "", rideFilter) ||
        matchesSearchQuery(c?.coaster_type ?? "", rideFilter) ||
        matchesSearchQuery(effectiveCoasterType(c?.coaster_type, c?.manufacturer), rideFilter) ||
        matchesSearchQuery(c?.manufacturer ?? "", rideFilter)
      );
    });
  }, [filteredUniqueRides, rideFilter]);

  async function removeRide(coasterId: number, name: string) {
    if (!confirm(`Remove "${name}" from your ridden list?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId || removing !== null) return;
    setRemoving(coasterId);
    const { error } = await supabase.from("rides").delete().eq("user_id", userId).eq("coaster_id", coasterId);
    if (!error) {
      setRides((prev) => prev.filter((r) => r.coaster_id !== coasterId));
    }
    setRemoving(null);
  }

  const statCards = [
    { label: "Coasters ridden", value: filteredUniqueRides.length },
    { label: "Parks visited", value: parksVisited },
    { label: "Countries visited", value: countriesVisited },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <AuthGate>
          <h1 className="mb-6 text-2xl font-bold text-slate-900">Your stats</h1>
          {fetchError && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              Something went wrong loading your data. Please refresh the page.
            </p>
          )}

          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {statCards.map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {loading ? <span className="text-slate-300">&mdash;</span> : value}
                </p>
              </div>
            ))}
          </div>

          {/* Personal records */}
          {(loading || hasAnyRecord) && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Personal records</h2>
                <UnitsToggle units={units} onChange={setUnits} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {(
                  [
                    {
                      key: "longest",
                      label: "Longest",
                      record: personalRecords.longest,
                      format: (v: number) => fmtLength(v, units) ?? `${v.toLocaleString()} ft`,
                      icon: (
                        // arrows-right-left: horizontal span / track length
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M13.2 2.24a.75.75 0 00.04 1.06l2.1 1.95H6.75a.75.75 0 000 1.5h8.59l-2.1 1.95a.75.75 0 101.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 00-1.06.04zm-6.4 8a.75.75 0 00-1.06-.04l-3.5 3.25a.75.75 0 000 1.1l3.5 3.25a.75.75 0 101.02-1.1l-2.1-1.95h8.59a.75.75 0 000-1.5H4.66l2.1-1.95a.75.75 0 00.04-1.06z" clipRule="evenodd" />
                        </svg>
                      ),
                    },
                    {
                      key: "tallest",
                      label: "Tallest",
                      record: personalRecords.tallest,
                      format: (v: number) => fmtHeight(v, units) ?? `${v} ft`,
                      icon: (
                        // arrow-up: height
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                        </svg>
                      ),
                    },
                    {
                      key: "fastest",
                      label: "Fastest",
                      record: personalRecords.fastest,
                      format: (v: number) => fmtSpeed(v, units) ?? `${v} mph`,
                      icon: (
                        // speedometer: dial ring + needle + hub
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 13A8 8 0 1 1 18 13L15.5 13A5.5 5.5 0 1 0 4.5 13Z" />
                          <path d="M9.5 12.5 10.5 13.5 14.5 9.5Z" />
                          <circle cx="10" cy="13" r="1.2" />
                        </svg>
                      ),
                    },
                    {
                      key: "mostInversions",
                      label: "Most inversions",
                      record: personalRecords.mostInversions,
                      format: (v: number) => `${v}`,
                      icon: (
                        // arrow-path: full 360° loop — inversions
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                        </svg>
                      ),
                    },
                    {
                      key: "longestDuration",
                      label: "Longest ride",
                      record: personalRecords.longestDuration,
                      format: (v: number) => fmtDuration(v) ?? `${v}s`,
                      icon: (
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5.69l3.22 3.22a.75.75 0 101.06-1.06l-2.78-2.78V5z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ),
                    },
                  ] as const
                ).map(({ key, label, record, format, icon }) => (
                  <div key={key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-500">
                      {icon}
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
                    </div>
                    {loading ? (
                      <p className="mt-2 text-slate-300">&mdash;</p>
                    ) : record ? (
                      <>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{format(record.value)}</p>
                        <p className="mt-0.5 truncate text-xs font-medium text-slate-700">{record.name}</p>
                        {record.park && (
                          <p className="truncate text-xs text-slate-400">{record.park}</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-slate-400">—</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-5 lg:grid-cols-2 lg:items-start">
            {/* Rides ridden */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-900">Rides ridden</h2>
              <label className="mb-3 inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={includeFamilyRides}
                  onChange={(e) => setIncludeFamilyRides(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-400"
                />
                Include kiddie / family-style rides
              </label>
              {loading ? (
                <p className="text-sm text-slate-400">Loading&hellip;</p>
              ) : filteredUniqueRides.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No rides logged yet. Mark rides as ridden from the map or your{" "}
                  <Link href="/wishlist" className="font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800">
                    wishlist
                  </Link>
                  .
                </p>
              ) : (
                <>
                  {filteredUniqueRides.length > 3 && (
                    <input
                      type="text"
                      value={rideFilter}
                      onChange={(e) => setRideFilter(e.target.value)}
                      placeholder="Filter rides…"
                      aria-label="Filter rides"
                      className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  )}
                  <ul className="max-h-[min(50vh,22rem)] divide-y divide-slate-100 overflow-y-auto overscroll-contain pb-2 pr-1 pt-0 [scrollbar-gutter:stable]">
                    {filteredRides.length === 0 && (
                      <p className="py-2 text-xs text-slate-400">No matches</p>
                    )}
                    {filteredRides.map((ride) => {
                      const parkLine = formatParkLabel(
                        ride.coasters?.parks?.name,
                        ride.coasters?.parks?.country,
                      );
                      return (
                      <li key={ride.coaster_id} className="group flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {cleanCoasterName(ride.coasters?.name ?? `Coaster ${ride.coaster_id}`)}
                          </p>
                          <p className="mt-0.5 text-xs leading-snug text-slate-500 break-words">
                            {parkLine && <span>{parkLine} &middot; </span>}
                            {effectiveCoasterType(ride.coasters?.coaster_type, ride.coasters?.manufacturer)}
                            {ride.coasters?.manufacturer && <span> &middot; {ride.coasters.manufacturer}</span>}
                          </p>
                        </div>
                        <button
                          onClick={() => removeRide(ride.coaster_id, cleanCoasterName(ride.coasters?.name ?? "this ride"))}
                          disabled={removing === ride.coaster_id}
                          title="Remove ride"
                          className="mt-0.5 shrink-0 rounded p-0.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 focus:text-red-500 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 disabled:cursor-wait"
                        >
                          {removing === ride.coaster_id ? (
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </li>
                    );
                    })}
                  </ul>
                </>
              )}
            </section>

            <div className="flex flex-col gap-5">
              {/* Top parks */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold text-slate-900">Top parks</h2>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading&hellip;</p>
                ) : topParks.length === 0 ? (
                  <p className="text-sm text-slate-500">No rides logged yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {topParks.map(([name, count], i) => (
                      <li key={name} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                            {i + 1}
                          </span>
                          <span className="truncate text-sm text-slate-700">{name}</span>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-900">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Countries visited */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold text-slate-900">Countries visited</h2>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading&hellip;</p>
                ) : countriesWithRideCounts.length === 0 ? (
                  <p className="text-sm text-slate-500">No country data for your rides yet.</p>
                ) : (
                  <ul className="max-h-[min(40vh,14rem)] space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                    {countriesWithRideCounts.map(([country, count]) => (
                      <li key={country} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm text-slate-700">{country}</span>
                        <span className="shrink-0 text-sm tabular-nums text-slate-500">
                          {count} {count === 1 ? "ride" : "rides"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </AuthGate>
      </main>
    </div>
  );
}
