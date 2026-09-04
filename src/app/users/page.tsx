"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AppPageHeading } from "@/components/app-page-heading";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SiteHeader } from "@/components/site-header";
import { unjamGeoLabel } from "@/lib/geo-country";
import { signAvatarUrls } from "@/lib/profile-photos";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";

type FriendshipRow = {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
};

type PublicProfile = {
  user_id: string;
  display_name: string | null;
  country_code: string | null;
  avatar_key: string | null;
  avatar_path: string | null;
  avatarUrl?: string | null;
  favorite_ride_id: number | null;
  favorite_park_id: number | null;
  creditCount?: number;
};

type ParkRow = {
  id: number;
  name: string;
  country: string | null;
};

type CoasterRow = {
  id: number;
  name: string;
  parks: { name: string | null; country: string | null } | { name: string | null; country: string | null }[] | null;
};

const PROFILE_SELECT =
  "user_id, display_name, country_code, avatar_key, avatar_path, favorite_ride_id, favorite_park_id";

function countryNameFromCode(code: string | null | undefined): string | null {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

function parkNameOnly(park: ParkRow | null | undefined): string {
  if (!park) return "Not set";
  return unjamGeoLabel(park.name) || "Not set";
}

function coasterNameOnly(coaster: CoasterRow | null | undefined): { name: string; park: string | null } {
  if (!coaster) return { name: "Not set", park: null };
  const name = (coaster.name ?? "").trim() || "Not set";
  const park = Array.isArray(coaster.parks) ? (coaster.parks[0] ?? null) : coaster.parks;
  const parkName = unjamGeoLabel(park?.name) || null;
  return { name, park: parkName };
}

function formatCreditCount(count: number | undefined): string {
  if (count == null) return "—";
  return `${count.toLocaleString()} credit${count === 1 ? "" : "s"}`;
}

async function withAvatarUrls(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  rows: PublicProfile[],
): Promise<PublicProfile[]> {
  const signed = await signAvatarUrls(
    supabase,
    rows.map((row) => row.avatar_path),
  );
  return rows.map((row) => ({
    ...row,
    avatarUrl: row.avatar_path ? signed.get(row.avatar_path) ?? null : null,
  }));
}

async function loadFavoriteLookups(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  rows: PublicProfile[],
): Promise<{ parksById: Record<number, ParkRow>; coastersById: Record<number, CoasterRow> }> {
  const favoriteParkIds = new Set<number>();
  const favoriteRideIds = new Set<number>();
  for (const row of rows) {
    if (row.favorite_park_id != null) favoriteParkIds.add(row.favorite_park_id);
    if (row.favorite_ride_id != null) favoriteRideIds.add(row.favorite_ride_id);
  }

  const parksById: Record<number, ParkRow> = {};
  const coastersById: Record<number, CoasterRow> = {};

  if (favoriteParkIds.size > 0) {
    const { data: parkRows } = await supabase
      .from("parks")
      .select("id, name, country")
      .in("id", [...favoriteParkIds]);
    for (const park of (parkRows ?? []) as ParkRow[]) {
      parksById[park.id] = park;
    }
  }

  if (favoriteRideIds.size > 0) {
    const { data: coasterRows } = await supabase
      .from("coasters")
      .select("id, name, parks(name, country)")
      .in("id", [...favoriteRideIds]);
    for (const coaster of (coasterRows ?? []) as CoasterRow[]) {
      coastersById[coaster.id] = coaster;
    }
  }

  return { parksById, coastersById };
}

async function loadCreditCounts(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  userIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of userIds) counts[id] = 0;
  if (userIds.length === 0) return counts;

  // Each rides row is one unique coaster credit. Paginate in case the list is large.
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("rides")
      .select("user_id")
      .in("user_id", userIds)
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as { user_id: string }[]) {
      counts[row.user_id] = (counts[row.user_id] ?? 0) + 1;
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return counts;
}

export default function UsersPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [hasDisplayName, setHasDisplayName] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [parksById, setParksById] = useState<Record<number, ParkRow>>({});
  const [coastersById, setCoastersById] = useState<Record<number, CoasterRow>>({});
  const [isSearchResult, setIsSearchResult] = useState(false);
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);

  const relationshipByOtherId = useMemo(() => {
    const map = new Map<string, FriendshipRow>();
    if (!userId) return map;
    for (const row of friendships) {
      const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      map.set(otherId, row);
    }
    return map;
  }, [friendships, userId]);

  async function loadFriendships(
    supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
    activeUserId: string,
  ) {
    const { data } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${activeUserId},addressee_id.eq.${activeUserId}`);
    setFriendships((data ?? []) as FriendshipRow[]);
  }

  async function loadPublicProfiles(
    supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
    activeUserId: string,
    search?: string,
  ) {
    let request = supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("stats_visibility", "public")
      .not("display_name", "is", null)
      .neq("user_id", activeUserId)
      .order("display_name")
      .limit(60);

    const trimmed = search?.trim() ?? "";
    if (trimmed.length >= 2) {
      request = request.ilike("display_name", `%${trimmed}%`);
    }

    const { data, error: loadError } = await request;
    if (loadError) {
      setError("Could not load public users. Please try again.");
      setProfiles([]);
      setParksById({});
      setCoastersById({});
      return;
    }

    const baseRows = await withAvatarUrls(supabase, (data ?? []) as PublicProfile[]);
    const userIds = baseRows.map((row) => row.user_id);
    const [lookups, creditCounts] = await Promise.all([
      loadFavoriteLookups(supabase, baseRows),
      loadCreditCounts(supabase, userIds),
    ]);

    setError("");
    setParksById(lookups.parksById);
    setCoastersById(lookups.coastersById);
    setProfiles(
      baseRows.map((row) => ({
        ...row,
        creditCount: creditCounts[row.user_id] ?? 0,
      })),
    );
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void getSupabaseUserSafe().then(async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const [{ data: me }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
        loadFriendships(supabase, user.id),
        loadPublicProfiles(supabase, user.id),
      ]);
      setHasDisplayName(Boolean(me?.display_name?.trim()));
      setLoading(false);
    });
  }, []);

  async function submitSearch(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;
    const trimmed = query.trim();
    if (trimmed.length > 0 && trimmed.length < 2) {
      setToast("Type at least 2 characters to search.");
      return;
    }
    setSearching(true);
    setIsSearchResult(trimmed.length >= 2);
    await loadPublicProfiles(supabase, userId, trimmed);
    setSearching(false);
  }

  async function sendRequest(targetId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;
    if (!hasDisplayName) {
      setToast("Set your display name in Account before sending friend requests.");
      return;
    }
    const existing = relationshipByOtherId.get(targetId);
    setBusyId(targetId);

    if (existing?.status === "pending" && existing.addressee_id === userId) {
      const { error: acceptError } = await supabase
        .from("friendships")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("addressee_id", userId);
      setBusyId(null);
      if (acceptError) {
        setToast(acceptError.message ?? "Could not accept request.");
        return;
      }
      await loadFriendships(supabase, userId);
      setToast("Friend request accepted.");
      return;
    }

    if (existing && existing.status !== "declined") {
      setBusyId(null);
      return;
    }

    const { error: insertError } = existing
      ? await supabase
          .from("friendships")
          .update({
            requester_id: userId,
            addressee_id: targetId,
            status: "pending",
            responded_at: null,
          })
          .eq("id", existing.id)
      : await supabase.from("friendships").insert({
          requester_id: userId,
          addressee_id: targetId,
          status: "pending",
        });
    setBusyId(null);
    if (insertError) {
      setToast(insertError.message ?? "Could not send request.");
      return;
    }
    await loadFriendships(supabase, userId);
    setToast("Friend request sent.");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-5 sm:p-6">
        <AuthGate>
          <div className="mb-5 sm:mb-6">
            <Link href="/friends" className="text-sm font-medium text-amber-700 underline-offset-2 hover:underline">
              ← Friends
            </Link>
            <AppPageHeading className="mt-2">Public profiles</AppPageHeading>
            <p className="mt-1 text-sm text-slate-500">
              Preview credits and favorites, or open a profile for full stats. Change visibility in{" "}
              <Link href="/account" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                Account
              </Link>
              .
            </p>
          </div>

          {toast && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
              <span>{toast}</span>
              <button onClick={() => setToast(null)} className="ml-3 text-slate-300 hover:text-white">
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-slate-500">Loading&hellip;</p>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <form onSubmit={(e) => void submitSearch(e)} className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 sm:py-2"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="cursor-pointer rounded-lg bg-amber-500 px-4 py-2.5 text-center text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-28 sm:py-2"
                >
                  {searching ? "Searching..." : "Search"}
                </button>
              </form>

              {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

              {profiles.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  {isSearchResult
                    ? "No public users match that name."
                    : "Nobody has made their profile public yet. Set yours to Public in Account to appear here."}
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {profiles.map((profile) => {
                    const relation = relationshipByOtherId.get(profile.user_id);
                    const canAdd = !relation || relation.status === "declined";
                    const country = countryNameFromCode(profile.country_code);
                    const favRide = coasterNameOnly(
                      profile.favorite_ride_id != null ? coastersById[profile.favorite_ride_id] : null,
                    );
                    const favPark = parkNameOnly(
                      profile.favorite_park_id != null ? parksById[profile.favorite_park_id] : null,
                    );
                    const metaBits = [
                      country,
                      formatCreditCount(profile.creditCount),
                      relation?.status === "accepted" ? "Friend" : null,
                      relation?.status === "pending"
                        ? relation.requester_id === userId
                          ? "Request sent"
                          : "Requested you"
                        : null,
                    ].filter(Boolean);
                    return (
                      <li
                        key={profile.user_id}
                        className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 sm:bg-transparent"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <ProfileAvatar
                            avatarKey={profile.avatar_key}
                            imageUrl={profile.avatarUrl}
                            name={profile.display_name}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">
                              {profile.display_name?.trim() || "CoasterTrak user"}
                            </p>
                            <p className="truncate text-xs text-slate-500">{metaBits.join(" · ")}</p>
                          </div>
                        </div>

                        <dl className="mt-3 grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs sm:grid-cols-[3.75rem_minmax(0,1fr)]">
                          <dt className="pt-0.5 font-medium text-slate-500">Ride</dt>
                          <dd className="min-w-0 text-slate-800">
                            <p className="truncate font-medium">{favRide.name}</p>
                            {favRide.park ? (
                              <p className="truncate text-slate-500">{favRide.park}</p>
                            ) : null}
                          </dd>
                          <dt className="pt-0.5 font-medium text-slate-500">Park</dt>
                          <dd className="min-w-0 truncate font-medium text-slate-800">{favPark}</dd>
                        </dl>

                        <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:justify-end">
                          <Link
                            href={`/stats?user=${encodeURIComponent(profile.user_id)}`}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-sm text-slate-700 hover:bg-slate-50 sm:px-3 sm:py-1.5"
                          >
                            Stats
                          </Link>
                          <Link
                            href={`/stats?user=${encodeURIComponent(profile.user_id)}&compare=1`}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-sm text-slate-700 hover:bg-slate-50 sm:px-3 sm:py-1.5"
                          >
                            Compare
                          </Link>
                          <button
                            type="button"
                            onClick={() => void sendRequest(profile.user_id)}
                            disabled={!canAdd || !hasDisplayName || busyId === profile.user_id}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:px-3 sm:py-1.5"
                          >
                            {relation?.status === "accepted"
                              ? "Friends"
                              : relation?.status === "pending"
                                ? relation.requester_id === userId
                                  ? "Sent"
                                  : "Accept"
                                : "Add"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </AuthGate>
      </main>
    </div>
  );
}
