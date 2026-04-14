"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import { SiteHeader } from "@/components/site-header";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { cleanCoasterName } from "@/lib/display";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import { normalizeLifecycleStatus } from "@/lib/coaster-status";

type WishlistItem = {
  coaster_id: number;
  added_at?: string | null;
  coasters?: {
    name: string;
    wikidata_id?: string | null;
    image_url?: string | null;
    coaster_type: string;
    manufacturer: string | null;
    status: string;
    parks?: { name: string } | null;
  } | null;
};

type WishlistSort =
  | "added_desc"
  | "added_asc"
  | "ride_az"
  | "ride_za"
  | "park_az"
  | "park_za";

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [userId, setUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<number, "ridden" | "removing" | null>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<WishlistSort>("added_desc");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void getSupabaseUserSafe().then(async (user) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data: rows, error } = await supabase
        .from("wishlist")
        .select("coaster_id, added_at, coasters(name, wikidata_id, image_url, coaster_type, manufacturer, status, parks(name))")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });

      if (error) setToast("Failed to load wishlist. Please refresh.");
      const mapped = ((rows ?? []) as unknown as WishlistItem[]).map((item) => ({
        ...item,
        coasters: item.coasters ? applyCoasterKnownFixes(item.coasters) : null,
      }));
      setItems(mapped);
      setLoading(false);
    });
  }, []);

  const sortedItems = useMemo(() => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      if (sortBy === "ride_az" || sortBy === "ride_za") {
        const aName = cleanCoasterName(a.coasters?.name ?? `Coaster ${a.coaster_id}`);
        const bName = cleanCoasterName(b.coasters?.name ?? `Coaster ${b.coaster_id}`);
        const byName = aName.localeCompare(bName, undefined, { sensitivity: "base" });
        if (byName !== 0) return sortBy === "ride_az" ? byName : -byName;
        return sortBy === "ride_az" ? a.coaster_id - b.coaster_id : b.coaster_id - a.coaster_id;
      }

      if (sortBy === "park_az" || sortBy === "park_za") {
        const aPark = a.coasters?.parks?.name ?? "";
        const bPark = b.coasters?.parks?.name ?? "";
        const byPark = aPark.localeCompare(bPark, undefined, { sensitivity: "base" });
        if (byPark !== 0) return sortBy === "park_az" ? byPark : -byPark;
        const aName = cleanCoasterName(a.coasters?.name ?? `Coaster ${a.coaster_id}`);
        const bName = cleanCoasterName(b.coasters?.name ?? `Coaster ${b.coaster_id}`);
        const byName = aName.localeCompare(bName, undefined, { sensitivity: "base" });
        if (byName !== 0) return sortBy === "park_az" ? byName : -byName;
        return sortBy === "park_az" ? a.coaster_id - b.coaster_id : b.coaster_id - a.coaster_id;
      }

      const aTime = a.added_at ? Date.parse(a.added_at) : 0;
      const bTime = b.added_at ? Date.parse(b.added_at) : 0;
      if (aTime !== bTime) return sortBy === "added_asc" ? aTime - bTime : bTime - aTime;
      return sortBy === "added_asc" ? a.coaster_id - b.coaster_id : b.coaster_id - a.coaster_id;
    });
    return sorted;
  }, [items, sortBy]);

  async function markRidden(coasterId: number) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;
    setPending((p) => ({ ...p, [coasterId]: "ridden" }));

    const { error: rideErr } = await supabase.from("rides").upsert(
      { user_id: userId, coaster_id: coasterId },
      { onConflict: "user_id,coaster_id", ignoreDuplicates: true },
    );

    if (rideErr) {
      setToast("Failed to mark as ridden. Please try again.");
      setPending((p) => ({ ...p, [coasterId]: null }));
      return;
    }

    await supabase.from("wishlist").delete().eq("user_id", userId).eq("coaster_id", coasterId);
    setItems((prev) => prev.filter((i) => i.coaster_id !== coasterId));
    setPending((p) => ({ ...p, [coasterId]: null }));
  }

  async function removeFromWishlist(coasterId: number) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;
    setPending((p) => ({ ...p, [coasterId]: "removing" }));

    const { error } = await supabase.from("wishlist").delete().eq("user_id", userId).eq("coaster_id", coasterId);
    if (error) {
      setToast("Failed to remove. Please try again.");
      setPending((p) => ({ ...p, [coasterId]: null }));
      return;
    }

    setItems((prev) => prev.filter((i) => i.coaster_id !== coasterId));
    setPending((p) => ({ ...p, [coasterId]: null }));
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl p-6">
        <AuthGate>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Your wishlist</h1>
              {!loading && items.length > 0 && (
                <p className="mt-0.5 text-sm text-slate-500">{items.length} ride{items.length !== 1 ? "s" : ""} to conquer</p>
              )}
            </div>
            <Link href="/map" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-400">
              Find more &rarr;
            </Link>
          </div>

          {!loading && items.length > 0 && (
            <div className="mb-4 flex items-center justify-end gap-2">
              <label htmlFor="wishlist-sort" className="text-sm font-medium text-slate-600">
                Sort by
              </label>
              <select
                id="wishlist-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as WishlistSort)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="added_desc">Added (newest)</option>
                <option value="added_asc">Added (oldest)</option>
                <option value="ride_az">Ride (A-Z)</option>
                <option value="ride_za">Ride (Z-A)</option>
                <option value="park_az">Park (A-Z)</option>
                <option value="park_za">Park (Z-A)</option>
              </select>
            </div>
          )}

          {toast && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              <span>{toast}</span>
              <button onClick={() => setToast(null)} className="ml-2 font-semibold hover:text-red-800">&times;</button>
            </div>
          )}
          {loading ? (
            <p className="text-slate-500">Loading&hellip;</p>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
              <p className="font-medium text-slate-700">Your wishlist is empty</p>
              <p className="mt-1 text-sm text-slate-500">Head to the map and add some rides you want to do.</p>
              <Link href="/map" className="mt-4 inline-block rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-400">
                Open map
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {sortedItems.map((item) => {
                const coaster = item.coasters;
                const busy = pending[item.coaster_id];
                const coasterName = cleanCoasterName(coaster?.name ?? `Coaster ${item.coaster_id}`);
                const typeLabel = coaster
                  ? effectiveCoasterType(coaster.coaster_type, coaster.manufacturer)
                  : "Unknown";
                const lifecycle = normalizeLifecycleStatus(coaster?.status);
                return (
                  <li
                    key={item.coaster_id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <CoasterThumbnail name={coasterName} imageUrl={coaster?.image_url} />
                      <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {coasterName}
                      </p>
                      {coaster?.parks?.name && (
                        <p className="mt-0.5 truncate text-sm text-slate-500">{coaster.parks.name}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {typeLabel !== "Unknown" && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {typeLabel}
                          </span>
                        )}
                        {coaster?.manufacturer && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {coaster.manufacturer}
                          </span>
                        )}
                        {coaster?.status && (
                          lifecycle === "Defunct" && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                              Defunct
                            </span>
                          )
                        )}
                      </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => markRidden(item.coaster_id)}
                        disabled={!!busy}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
                      >
                        {busy === "ridden" ? "Saving\u2026" : "Mark ridden"}
                      </button>
                      <button
                        onClick={() => removeFromWishlist(item.coaster_id)}
                        disabled={!!busy}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:border-red-300 hover:text-red-500 disabled:opacity-50"
                      >
                        {busy === "removing" ? "Removing\u2026" : "Remove"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AuthGate>
      </main>
    </div>
  );
}
