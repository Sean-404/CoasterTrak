"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type RideRow = {
  coaster_id: number;
  coasters?: {
    park_id: number;
    parks?: { name: string; country: string }[] | null;
  }[] | null;
};

export default function StatsPage() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [message, setMessage] = useState("Loading stats...");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Add Supabase env vars to load stats.");
      return;
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setMessage("Sign in to view stats.");
        return;
      }

      const ridesRes = await supabase
        .from("rides")
        .select("coaster_id, coasters(park_id, parks(name, country))")
        .eq("user_id", data.user.id);
      const wishRes = await supabase.from("wishlist").select("coaster_id", { count: "exact", head: true }).eq("user_id", data.user.id);

      if (ridesRes.error) {
        setMessage(ridesRes.error.message);
        return;
      }

      setRides((ridesRes.data ?? []) as RideRow[]);
      setWishlistCount(wishRes.count ?? 0);
      setMessage("");
    });
  }, []);

  const totalRides = rides.length;
  const countriesVisited = useMemo(
    () => new Set(rides.map((r) => r.coasters?.[0]?.parks?.[0]?.country).filter(Boolean) as string[]).size,
    [rides],
  );
  const topParks = useMemo(() => {
    const counter = new Map<string, number>();
    for (const ride of rides) {
      const name = ride.coasters?.[0]?.parks?.[0]?.name;
      if (!name) continue;
      counter.set(name, (counter.get(name) ?? 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [rides]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Your stats</h1>
        <AuthGate>
          {message ? <p className="mb-4 text-slate-600">{message}</p> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">Coasters ridden</p>
              <p className="text-2xl font-bold">{totalRides}</p>
            </div>
            <div className="rounded border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">Countries visited</p>
              <p className="text-2xl font-bold">{countriesVisited}</p>
            </div>
            <div className="rounded border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">Wishlist count</p>
              <p className="text-2xl font-bold">{wishlistCount}</p>
            </div>
          </div>
          <section className="mt-5 rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-lg font-semibold">Top parks</h2>
            {topParks.length ? (
              <ul className="space-y-1">
                {topParks.map(([name, count]) => (
                  <li key={name} className="text-slate-700">
                    {name}: {count} rides
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-600">No rides logged yet.</p>
            )}
          </section>
        </AuthGate>
      </main>
    </div>
  );
}
