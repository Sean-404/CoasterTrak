"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

// Supabase returns single objects for FK joins, not arrays
type RideRow = {
  coaster_id: number;
  coasters?: {
    name: string;
    coaster_type: string;
    parks?: { name: string; country: string } | null;
  } | null;
};

type WishlistRow = {
  coaster_id: number;
  coasters?: {
    name: string;
    coaster_type: string;
    parks?: { name: string } | null;
  } | null;
};

export default function StatsPage() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [wishlist, setWishlist] = useState<WishlistRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }

      const [ridesRes, wishRes] = await Promise.all([
        supabase
          .from("rides")
          .select("coaster_id, coasters(name, coaster_type, parks(name, country))")
          .eq("user_id", data.user.id),
        supabase
          .from("wishlist")
          .select("coaster_id, coasters(name, coaster_type, parks(name))")
          .eq("user_id", data.user.id),
      ]);

      setRides((ridesRes.data ?? []) as unknown as RideRow[]);
      setWishlist((wishRes.data ?? []) as unknown as WishlistRow[]);
      setLoading(false);
    });
  }, []);

  const countriesVisited = useMemo(
    () => new Set(rides.map((r) => r.coasters?.parks?.country).filter(Boolean)).size,
    [rides],
  );

  const parksVisited = useMemo(
    () => new Set(rides.map((r) => r.coasters?.parks?.name).filter(Boolean)).size,
    [rides],
  );

  const topParks = useMemo(() => {
    const counter = new Map<string, number>();
    for (const ride of rides) {
      const name = ride.coasters?.parks?.name;
      if (!name) continue;
      counter.set(name, (counter.get(name) ?? 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [rides]);

  const statCards = [
    { label: "Coasters ridden", value: rides.length },
    { label: "Parks visited", value: parksVisited },
    { label: "Countries visited", value: countriesVisited },
    { label: "On wishlist", value: wishlist.length },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Your stats</h1>
        <AuthGate>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            {statCards.map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {loading ? <span className="text-slate-300">—</span> : value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {/* Rides ridden */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-900">Rides ridden</h2>
              {loading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : rides.length === 0 ? (
                <p className="text-sm text-slate-500">No rides logged yet. Mark rides as ridden from the map or your wishlist.</p>
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {rides.map((ride, i) => (
                    <li key={`${ride.coaster_id}-${i}`} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                      <p className="text-sm font-medium text-slate-900">{ride.coasters?.name ?? `Coaster ${ride.coaster_id}`}</p>
                      <p className="text-xs text-slate-500">
                        {ride.coasters?.parks?.name && <span>{ride.coasters.parks.name} · </span>}
                        {ride.coasters?.coaster_type}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex flex-col gap-5">
              {/* Top parks */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold text-slate-900">Top parks</h2>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading…</p>
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

              {/* Wishlist */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold text-slate-900">Wishlist</h2>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : wishlist.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing on your wishlist yet.</p>
                ) : (
                  <ul className="max-h-40 space-y-2 overflow-y-auto pr-1">
                    {wishlist.map((item, i) => (
                      <li key={`${item.coaster_id}-${i}`} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                        <p className="text-sm font-medium text-slate-900">{item.coasters?.name ?? `Coaster ${item.coaster_id}`}</p>
                        <p className="text-xs text-slate-500">{item.coasters?.parks?.name}</p>
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
