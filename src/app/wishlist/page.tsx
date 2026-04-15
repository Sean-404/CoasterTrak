"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import { SiteHeader } from "@/components/site-header";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { isThrillCoaster, normalizeCoasterDedupKey } from "@/lib/coaster-dedup";
import { cleanCoasterName } from "@/lib/display";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import { normalizeLifecycleStatus } from "@/lib/coaster-status";

type WishlistItem = {
  coaster_id: number;
  added_at?: string | null;
  coasters?: {
    park_id?: number;
    name: string;
    wikidata_id?: string | null;
    image_url?: string | null;
    coaster_type: string;
    manufacturer: string | null;
    status: string;
    length_ft?: number | null;
    speed_mph?: number | null;
    height_ft?: number | null;
    inversions?: number | null;
    duration_s?: number | null;
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

type WishlistRowProps = {
  item: WishlistItem;
  busy: "ridden" | "removing" | null;
  onMarkRidden: (coasterId: number) => void;
  onRemoveFromWishlist: (coasterId: number) => void;
};

const WishlistRow = memo(function WishlistRow({
  item,
  busy,
  onMarkRidden,
  onRemoveFromWishlist,
}: WishlistRowProps) {
  const coaster = item.coasters;
  const coasterName = cleanCoasterName(coaster?.name ?? `Coaster ${item.coaster_id}`);
  const typeLabel = coaster
    ? effectiveCoasterType(coaster.coaster_type, coaster.manufacturer)
    : "Unknown";
  const lifecycle = normalizeLifecycleStatus(coaster?.status);

  return (
    <li
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5"
      style={{ contentVisibility: "auto", containIntrinsicSize: "96px" }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <CoasterThumbnail
          name={coasterName}
          imageUrl={coaster?.image_url}
          sizeClassName="h-12 w-12 sm:h-14 sm:w-14"
          showMissingLabel
        />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold leading-snug text-slate-900">
            {coasterName}
          </p>
          {coaster?.parks?.name && (
            <p className="mt-0.5 break-words text-sm text-slate-500">{coaster.parks.name}</p>
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
      <div className="flex w-full flex-wrap gap-2 sm:mt-0 sm:w-auto sm:flex-nowrap sm:shrink-0">
        <button
          onClick={() => onMarkRidden(item.coaster_id)}
          disabled={!!busy}
          className="flex-1 whitespace-nowrap rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50 sm:flex-none"
        >
          {busy === "ridden" ? "Saving\u2026" : "Mark ridden"}
        </button>
        <button
          onClick={() => onRemoveFromWishlist(item.coaster_id)}
          disabled={!!busy}
          className="flex-1 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:border-red-300 hover:text-red-500 disabled:opacity-50 sm:flex-none"
        >
          {busy === "removing" ? "Removing\u2026" : "Remove"}
        </button>
      </div>
    </li>
  );
}, (prev, next) =>
  prev.item === next.item &&
  prev.busy === next.busy &&
  prev.onMarkRidden === next.onMarkRidden &&
  prev.onRemoveFromWishlist === next.onRemoveFromWishlist
);

function imageFallbackKeys(parkId: number, coasterName: string): string[] {
  const base = normalizeCoasterDedupKey(coasterName);
  const keys = new Set<string>([`${parkId}:${base}`]);
  const stripped = base
    .replace(/megacoaster$/i, "")
    .replace(/hypercoaster$/i, "")
    .replace(/gigacoaster$/i, "")
    .replace(/stratacoaster$/i, "")
    .replace(/rollercoaster$/i, "")
    .replace(/coaster$/i, "");
  if (stripped && stripped !== base) keys.add(`${parkId}:${stripped}`);
  return [...keys];
}

async function fillMissingWishlistImages(
  rows: WishlistItem[],
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
): Promise<WishlistItem[]> {
  const missing = rows.filter(
    (r) => r.coasters?.image_url == null && r.coasters?.park_id != null && r.coasters?.name,
  );
  if (missing.length === 0) return rows;

  const parkIds = [...new Set(missing.map((r) => r.coasters!.park_id!))];
  const wikidataIds = [
    ...new Set(
      missing
        .map((r) => r.coasters?.wikidata_id?.trim().toUpperCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const [parkScopedRes, wikidataRes] = await Promise.all([
    supabase
      .from("coasters")
      .select("park_id, name, wikidata_id, image_url")
      .in("park_id", parkIds)
      .not("image_url", "is", null),
    wikidataIds.length > 0
      ? supabase
          .from("coasters")
          .select("park_id, name, wikidata_id, image_url")
          .in("wikidata_id", wikidataIds)
          .not("image_url", "is", null)
      : Promise.resolve({
          data: [] as Array<{ park_id: number; name: string; wikidata_id: string | null; image_url: string | null }>,
          error: null,
        }),
  ]);
  if (parkScopedRes.error) return rows;
  if (wikidataRes.error) return rows;
  const data = [...(parkScopedRes.data ?? []), ...(wikidataRes.data ?? [])];
  if (data.length === 0) return rows;

  const imageByKey = new Map<string, string>();
  const imageByWikidataId = new Map<string, string>();
  for (const entry of data as Array<{ park_id: number; name: string; wikidata_id: string | null; image_url: string | null }>) {
    if (!entry.image_url) continue;
    const qid = entry.wikidata_id?.trim().toUpperCase();
    if (qid && !imageByWikidataId.has(qid)) imageByWikidataId.set(qid, entry.image_url);
    for (const key of imageFallbackKeys(entry.park_id, entry.name)) {
      if (!imageByKey.has(key)) imageByKey.set(key, entry.image_url);
    }
  }

  return rows.map((r) => {
    const coaster = r.coasters;
    if (!coaster || coaster.image_url || coaster.park_id == null) return r;
    const qid = coaster.wikidata_id?.trim().toUpperCase();
    let fallback = qid ? imageByWikidataId.get(qid) : undefined;
    for (const key of imageFallbackKeys(coaster.park_id, coaster.name)) {
      const hit = imageByKey.get(key);
      if (hit) {
        fallback = hit;
        break;
      }
    }
    if (!fallback) return r;
    return { ...r, coasters: { ...coaster, image_url: fallback } };
  });
}

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [userId, setUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<number, "ridden" | "removing" | null>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<WishlistSort>("added_desc");
  const [includeFamilyRides, setIncludeFamilyRides] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void getSupabaseUserSafe().then(async (user) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data: rows, error } = await supabase
        .from("wishlist")
        .select("coaster_id, added_at, coasters(park_id, name, wikidata_id, image_url, coaster_type, manufacturer, status, length_ft, speed_mph, height_ft, inversions, duration_s, parks(name))")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });

      if (error) setToast("Failed to load wishlist. Please refresh.");
      const mapped = ((rows ?? []) as unknown as WishlistItem[]).map((item) => ({
        ...item,
        coasters: item.coasters ? applyCoasterKnownFixes(item.coasters) : null,
      }));
      const hydrated = await fillMissingWishlistImages(mapped, supabase);
      setItems(hydrated);
      setLoading(false);
    });
  }, []);

  const filteredItems = useMemo(() => {
    if (includeFamilyRides) return items;
    return items.filter((item) => {
      const coaster = item.coasters;
      if (!coaster) return true;
      return isThrillCoaster(
        {
          id: item.coaster_id,
          park_id: coaster.park_id ?? -1,
          name: coaster.name,
          coaster_type: coaster.coaster_type,
          manufacturer: coaster.manufacturer ?? null,
          status: coaster.status,
          wikidata_id: coaster.wikidata_id ?? null,
          image_url: coaster.image_url ?? null,
          length_ft: coaster.length_ft ?? null,
          speed_mph: coaster.speed_mph ?? null,
          height_ft: coaster.height_ft ?? null,
          inversions: coaster.inversions ?? null,
          duration_s: coaster.duration_s ?? null,
        },
        coaster.parks?.name ?? null,
      );
    });
  }, [items, includeFamilyRides]);

  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems];
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
  }, [filteredItems, sortBy]);

  const markRidden = useCallback(async (coasterId: number) => {
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
  }, [userId]);

  const removeFromWishlist = useCallback(async (coasterId: number) => {
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
  }, [userId]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        <AuthGate>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Your wishlist</h1>
              {!loading && items.length > 0 && (
                <p className="mt-0.5 text-sm text-slate-500">
                  {sortedItems.length} ride{sortedItems.length !== 1 ? "s" : ""} to conquer
                  {!includeFamilyRides ? " (thrill-focused)" : ""}
                </p>
              )}
            </div>
            <Link href="/map" className="inline-flex w-fit rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-400">
              Find more &rarr;
            </Link>
          </div>

          {!loading && items.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={includeFamilyRides}
                  onChange={(e) => setIncludeFamilyRides(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-400"
                />
                Include kiddie / family-style rides
              </label>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <label htmlFor="wishlist-sort" className="text-sm font-medium text-slate-600">
                  Sort by
                </label>
                <select
                  id="wishlist-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as WishlistSort)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 sm:flex-none"
                >
                  <option value="added_desc">Added (newest)</option>
                  <option value="added_asc">Added (oldest)</option>
                  <option value="ride_az">Ride (A-Z)</option>
                  <option value="ride_za">Ride (Z-A)</option>
                  <option value="park_az">Park (A-Z)</option>
                  <option value="park_za">Park (Z-A)</option>
                </select>
              </div>
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
          ) : sortedItems.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p className="font-medium text-slate-700">No thrill rides in your current wishlist view</p>
              <p className="mt-1 text-sm text-slate-500">
                Try enabling kiddie/family rides above to see all wishlisted rides.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {sortedItems.map((item) => {
                const busy = pending[item.coaster_id];
                return (
                  <WishlistRow
                    key={item.coaster_id}
                    item={item}
                    busy={busy ?? null}
                    onMarkRidden={markRidden}
                    onRemoveFromWishlist={removeFromWishlist}
                  />
                );
              })}
            </ul>
          )}
        </AuthGate>
      </main>
    </div>
  );
}
