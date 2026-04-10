"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type WishlistItem = {
  coaster_id: number;
  coasters?: {
    name: string;
    coaster_type: string;
    status: string;
    parks?: { name: string } | null;
  } | null;
};

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<number, "ridden" | "removing" | null>>({});

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      setUserId(data.user.id);

      const { data: rows } = await supabase
        .from("wishlist")
        .select("coaster_id, coasters(name, coaster_type, status, parks(name))")
        .eq("user_id", data.user.id)
        .order("coaster_id");

      setItems((rows ?? []) as unknown as WishlistItem[]);
      setLoading(false);
    });
  }, []);

  async function markRidden(coasterId: number) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;
    setPending((p) => ({ ...p, [coasterId]: "ridden" }));

    await supabase.from("rides").insert({ user_id: userId, coaster_id: coasterId });
    await supabase.from("wishlist").delete().eq("user_id", userId).eq("coaster_id", coasterId);

    setItems((prev) => prev.filter((i) => i.coaster_id !== coasterId));
    setPending((p) => ({ ...p, [coasterId]: null }));
  }

  async function removeFromWishlist(coasterId: number) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;
    setPending((p) => ({ ...p, [coasterId]: "removing" }));

    await supabase.from("wishlist").delete().eq("user_id", userId).eq("coaster_id", coasterId);

    setItems((prev) => prev.filter((i) => i.coaster_id !== coasterId));
    setPending((p) => ({ ...p, [coasterId]: null }));
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl p-6">
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

        <AuthGate>
          {loading ? (
            <p className="text-slate-500">Loading wishlist…</p>
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
              {items.map((item) => {
                const coaster = item.coasters;
                const busy = pending[item.coaster_id];
                return (
                  <li
                    key={item.coaster_id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {coaster?.name ?? `Coaster ${item.coaster_id}`}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {coaster?.parks?.name && (
                          <span className="mr-2 text-slate-700">{coaster.parks.name}</span>
                        )}
                        {coaster?.coaster_type} &middot; {coaster?.status}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => markRidden(item.coaster_id)}
                        disabled={!!busy}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
                      >
                        {busy === "ridden" ? "Saving…" : "Mark ridden"}
                      </button>
                      <button
                        onClick={() => removeFromWishlist(item.coaster_id)}
                        disabled={!!busy}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:border-red-300 hover:text-red-500 disabled:opacity-50"
                      >
                        {busy === "removing" ? "Removing…" : "Remove"}
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
