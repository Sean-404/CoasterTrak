"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AppPageHeading } from "@/components/app-page-heading";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SiteHeader } from "@/components/site-header";
import { unjamGeoLabel } from "@/lib/geo-country";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import { canViewOtherUserStats } from "@/lib/ride-photos";
import { signAvatarUrls } from "@/lib/profile-photos";

type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";

type FriendshipRow = {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  country_code: string | null;
  avatar_key: string | null;
  avatar_path: string | null;
  avatarUrl?: string | null;
  favorite_ride_id: number | null;
  favorite_park_id: number | null;
  stats_visibility?: string | null;
};

const PROFILE_SELECT =
  "user_id, display_name, country_code, avatar_key, avatar_path, favorite_ride_id, favorite_park_id, stats_visibility";

async function withAvatarUrls(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  rows: ProfileRow[],
): Promise<ProfileRow[]> {
  const signed = await signAvatarUrls(
    supabase,
    rows.map((row) => row.avatar_path),
  );
  return rows.map((row) => ({
    ...row,
    avatarUrl: row.avatar_path ? signed.get(row.avatar_path) ?? null : null,
  }));
}

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

function profileLabel(profile: ProfileRow | null | undefined, fallbackId: string): string {
  const name = profile?.display_name?.trim();
  if (name) return name;
  return `User ${fallbackId.slice(0, 8)}`;
}

function countryNameFromCode(code: string | null | undefined): string {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "Unknown country";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

function parkLabel(park: ParkRow | null | undefined): string {
  if (!park) return "Not set";
  const n = unjamGeoLabel(park.name);
  const c = unjamGeoLabel(park.country);
  if (n && c) return `${n} · ${c}`;
  return n || c || "Not set";
}

function coasterLabel(coaster: CoasterRow | null | undefined): string {
  if (!coaster) return "Not set";
  const name = (coaster.name ?? "").trim();
  const park = Array.isArray(coaster.parks) ? (coaster.parks[0] ?? null) : coaster.parks;
  const parkName = (park?.name ?? "").trim();
  const country = (park?.country ?? "").trim();
  const context = [parkName, country].filter(Boolean).join(" · ");
  if (name && context) return `${name} · ${context}`;
  return name || context || "Not set";
}

export default function FriendsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [parksById, setParksById] = useState<Record<number, ParkRow>>({});
  const [coastersById, setCoastersById] = useState<Record<number, CoasterRow>>({});
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProfileRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  async function loadData(activeUserId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const [{ data: profile }, { data: friendRows, error: friendErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("user_id", activeUserId)
        .maybeSingle(),
      supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, updated_at")
        .or(`requester_id.eq.${activeUserId},addressee_id.eq.${activeUserId}`)
        .order("updated_at", { ascending: false }),
    ]);

    if (friendErr) {
      setToast("Failed to load friends. Please refresh.");
    }

    setMyProfile(((await withAvatarUrls(supabase, profile ? [profile as ProfileRow] : []))[0] ?? null));
    const rows = ((friendRows ?? []) as FriendshipRow[]);
    setFriendships(rows);

    const relatedIds = new Set<string>();
    for (const row of rows) {
      relatedIds.add(row.requester_id === activeUserId ? row.addressee_id : row.requester_id);
    }
    if (relatedIds.size === 0) {
      setProfilesById({});
      setParksById({});
      setCoastersById({});
      return;
    }

    const { data: relatedProfiles } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .in("user_id", [...relatedIds]);

    const hydratedRelated = await withAvatarUrls(supabase, (relatedProfiles ?? []) as ProfileRow[]);
    const map: Record<string, ProfileRow> = {};
    for (const p of hydratedRelated) {
      map[p.user_id] = p;
    }
    setProfilesById(map);

    const favoriteParkIds = new Set<number>();
    for (const profileRow of Object.values(map)) {
      if (profileRow.favorite_park_id != null) favoriteParkIds.add(profileRow.favorite_park_id);
    }
    if (profile?.favorite_park_id != null) favoriteParkIds.add(profile.favorite_park_id);
    if (favoriteParkIds.size > 0) {
      const { data: parkRows } = await supabase
        .from("parks")
        .select("id, name, country")
        .in("id", [...favoriteParkIds]);
      const parkMap: Record<number, ParkRow> = {};
      for (const park of (parkRows ?? []) as ParkRow[]) {
        parkMap[park.id] = park;
      }
      setParksById(parkMap);
    } else {
      setParksById({});
    }

    const favoriteRideIds = new Set<number>();
    for (const profileRow of Object.values(map)) {
      if (profileRow.favorite_ride_id != null) favoriteRideIds.add(profileRow.favorite_ride_id);
    }
    if (profile?.favorite_ride_id != null) favoriteRideIds.add(profile.favorite_ride_id);
    if (favoriteRideIds.size > 0) {
      const { data: coasterRows } = await supabase
        .from("coasters")
        .select("id, name, parks(name, country)")
        .in("id", [...favoriteRideIds]);
      const coasterMap: Record<number, CoasterRow> = {};
      for (const coaster of (coasterRows ?? []) as CoasterRow[]) {
        coasterMap[coaster.id] = coaster;
      }
      setCoastersById(coasterMap);
    } else {
      setCoastersById({});
    }
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
      await loadData(user.id);
      setLoading(false);
    });
  }, []);

  const relationshipByOtherId = useMemo(() => {
    const map = new Map<string, FriendshipRow>();
    if (!userId) return map;
    for (const row of friendships) {
      const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      map.set(otherId, row);
    }
    return map;
  }, [friendships, userId]);

  const incomingPending = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === userId),
    [friendships, userId],
  );
  const outgoingPending = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.requester_id === userId),
    [friendships, userId],
  );
  const acceptedFriends = useMemo(
    () => friendships.filter((f) => f.status === "accepted"),
    [friendships],
  );

  async function runMutation(
    id: number,
    mutation: () => PromiseLike<{ error: { message?: string } | null }>,
    successMessage: string,
  ) {
    if (!userId) return;
    setBusyId(id);
    const { error } = await mutation();
    setBusyId(null);
    if (error) {
      setToast(error.message ?? "Action failed. Please try again.");
      return;
    }
    await loadData(userId);
    setToast(successMessage);
  }

  async function sendRequest(targetId: string) {
    if (!userId) return;
    if (targetId === userId) {
      setToast("You cannot add yourself.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const existing = relationshipByOtherId.get(targetId);
    if (existing?.status === "accepted") {
      setToast("You are already friends.");
      return;
    }

    if (existing?.status === "pending") {
      if (existing.requester_id === userId) {
        setToast("Friend request already sent.");
        return;
      }
      await runMutation(
        existing.id,
        () =>
          supabase
            .from("friendships")
            .update({ status: "accepted", responded_at: new Date().toISOString() })
            .eq("id", existing.id)
            .eq("addressee_id", userId),
        "Friend request accepted.",
      );
      return;
    }

    if (existing) {
      await runMutation(
        existing.id,
        () =>
          supabase
            .from("friendships")
            .update({
              requester_id: userId,
              addressee_id: targetId,
              status: "pending",
              responded_at: null,
            })
            .eq("id", existing.id),
        "Friend request sent.",
      );
      return;
    }

    setSearching(true);
    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: targetId,
      status: "pending",
    });
    setSearching(false);

    if (error) {
      setToast(error.message ?? "Could not send request.");
      return;
    }

    await loadData(userId);
    setToast("Friend request sent.");
  }

  async function submitSearch(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setToast("Type at least 2 characters to search.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSearching(true);
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .ilike("display_name", `%${q}%`)
      .neq("user_id", userId)
      .limit(20);
    setSearching(false);

    if (error) {
      setToast(error.message ?? "Search failed.");
      return;
    }

    setSearchResults(await withAvatarUrls(supabase, (data ?? []) as ProfileRow[]));
  }

  async function acceptRequest(row: FriendshipRow) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;
    await runMutation(
      row.id,
      () =>
        supabase
          .from("friendships")
          .update({ status: "accepted", responded_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("addressee_id", userId),
      "Friend request accepted.",
    );
  }

  async function declineRequest(row: FriendshipRow) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await runMutation(
      row.id,
      () =>
        supabase
          .from("friendships")
          .update({ status: "declined", responded_at: new Date().toISOString() })
          .eq("id", row.id),
      "Friend request declined.",
    );
  }

  async function removeFriend(row: FriendshipRow) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await runMutation(
      row.id,
      () => supabase.from("friendships").delete().eq("id", row.id),
      "Friend removed.",
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <AuthGate>
          <div className="mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <AppPageHeading>Friends</AppPageHeading>
                <p className="mt-1 text-sm text-slate-500">
                  Search for people by display name, send requests, and compare credits with friends.
                </p>
              </div>
              <Link
                href="/users"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Browse public profiles
              </Link>
            </div>
            {!myProfile?.display_name && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Set your display name in Account before sending friend requests.
              </p>
            )}
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
            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">Find friends</h2>
                <form onSubmit={submitSearch} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by display name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={searching}
                    className="min-w-28 cursor-pointer rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {searching ? "Searching..." : "Search"}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {searchResults.map((profile) => {
                      const relation = relationshipByOtherId.get(profile.user_id);
                      const canAdd = !relation || relation.status === "declined";
                      const canViewStats = canViewOtherUserStats(
                        profile.stats_visibility,
                        relation?.status === "accepted",
                      );
                      return (
                        <li key={profile.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <ProfileAvatar
                              avatarKey={profile.avatar_key}
                              imageUrl={profile.avatarUrl}
                              name={profile.display_name}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{profileLabel(profile, profile.user_id)}</p>
                              <p className="text-xs text-slate-500">
                                {countryNameFromCode(profile.country_code)}
                                {relation?.status === "accepted" ? " · Friend" : ""}
                                {profile.stats_visibility === "public" ? " · Public stats" : ""}
                                {relation?.status === "pending"
                                  ? relation.requester_id === userId
                                    ? " · Request sent"
                                    : " · Requested you"
                                  : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {canViewStats ? (
                              <Link
                                href={`/stats?user=${encodeURIComponent(profile.user_id)}`}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                              >
                                Stats
                              </Link>
                            ) : null}
                            <button
                              onClick={() => void sendRequest(profile.user_id)}
                              disabled={!canAdd || !myProfile?.display_name}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {relation?.status === "accepted"
                                ? "Friends"
                                : relation?.status === "pending"
                                  ? relation.requester_id === userId
                                    ? "Sent"
                                    : "Accept"
                                  : "Add friend"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="grid gap-5 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-900">Incoming requests</h2>
                  {incomingPending.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No incoming requests.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {incomingPending.map((row) => {
                        const otherId = row.requester_id;
                        const other = profilesById[otherId];
                        return (
                          <li key={row.id} className="rounded-lg border border-slate-200 px-3 py-2">
                            <div className="flex items-center gap-3">
                              <ProfileAvatar
                                avatarKey={other?.avatar_key}
                                imageUrl={other?.avatarUrl}
                                name={other?.display_name}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900">{profileLabel(other, otherId)}</p>
                                <p className="text-xs text-slate-500">{countryNameFromCode(other?.country_code)}</p>
                              </div>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => void acceptRequest(row)}
                                disabled={busyId === row.id}
                                className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => void declineRequest(row)}
                                disabled={busyId === row.id}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-900">Sent requests</h2>
                  {outgoingPending.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No pending outgoing requests.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {outgoingPending.map((row) => {
                        const otherId = row.addressee_id;
                        const other = profilesById[otherId];
                        return (
                          <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <ProfileAvatar
                                avatarKey={other?.avatar_key}
                                imageUrl={other?.avatarUrl}
                                name={other?.display_name}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900">{profileLabel(other, otherId)}</p>
                                <p className="text-xs text-slate-500">{countryNameFromCode(other?.country_code)}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => void removeFriend(row)}
                              disabled={busyId === row.id}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">Your friends</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Open a friend&apos;s stats, or compare to see shared credits and what they still have that you don&apos;t.
                </p>
                {acceptedFriends.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No friends yet. Send your first request above.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {acceptedFriends.map((row) => {
                      const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
                      const other = profilesById[otherId];
                      const canViewStats = canViewOtherUserStats(other?.stats_visibility, true);
                      const nameContent = profileLabel(other, otherId);
                      return (
                        <li key={row.id} className="rounded-lg border border-slate-200 px-3 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <ProfileAvatar
                                avatarKey={other?.avatar_key}
                                imageUrl={other?.avatarUrl}
                                name={other?.display_name}
                                size="md"
                              />
                              <div className="min-w-0">
                                {canViewStats ? (
                                  <Link
                                    href={`/stats?user=${encodeURIComponent(otherId)}`}
                                    className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-amber-700"
                                  >
                                    {nameContent}
                                  </Link>
                                ) : (
                                  <p className="font-medium text-slate-900">{nameContent}</p>
                                )}
                                <p className="text-xs text-slate-500">{countryNameFromCode(other?.country_code)}</p>
                                {!canViewStats ? (
                                  <p className="mt-1 text-xs text-slate-500">This friend keeps their stats private.</p>
                                ) : (
                                  <>
                                    <p className="mt-1 text-xs text-slate-600 break-words">
                                      <span className="font-medium text-slate-700">Fav ride:</span>{" "}
                                      {coasterLabel(
                                        other?.favorite_ride_id != null
                                          ? coastersById[other.favorite_ride_id]
                                          : null,
                                      )}
                                    </p>
                                    <p className="text-xs text-slate-600 break-words">
                                      <span className="font-medium text-slate-700">Fav park:</span>{" "}
                                      {parkLabel(
                                        other?.favorite_park_id != null
                                          ? parksById[other.favorite_park_id]
                                          : null,
                                      )}
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex w-full gap-2 sm:w-auto">
                              {canViewStats ? (
                                <Link
                                  href={`/stats?user=${encodeURIComponent(otherId)}&compare=1`}
                                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm text-slate-700 hover:bg-slate-50 sm:flex-none"
                                >
                                  Compare stats
                                </Link>
                              ) : null}
                              <button
                                onClick={() => void removeFriend(row)}
                                disabled={busyId === row.id}
                                className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 sm:flex-none"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
        </AuthGate>
      </main>
    </div>
  );
}
