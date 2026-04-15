"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

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
  favorite_ride_id: number | null;
  favorite_park_id: number | null;
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

type RideStatsRow = {
  user_id: string;
  coaster_id: number;
  coasters:
    | {
        park_id: number | null;
        length_ft: number | null;
        speed_mph: number | null;
        height_ft: number | null;
        inversions: number | null;
        duration_s: number | null;
        parks: { country: string | null } | { country: string | null }[] | null;
      }
    | {
        park_id: number | null;
        length_ft: number | null;
        speed_mph: number | null;
        height_ft: number | null;
        inversions: number | null;
        duration_s: number | null;
        parks: { country: string | null } | { country: string | null }[] | null;
      }[]
    | null;
};

type UserStats = {
  coasters: number;
  parks: number;
  countries: number;
  longestFt: number | null;
  tallestFt: number | null;
  fastestMph: number | null;
  mostInversions: number | null;
  longestDurationS: number | null;
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
  const n = (park.name ?? "").trim();
  const c = (park.country ?? "").trim();
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

function deltaLabel(delta: number): string {
  if (delta === 0) return "Same as you";
  if (delta > 0) return `${delta} more than you`;
  return `${Math.abs(delta)} fewer than you`;
}

function asCoasterObject(
  coasters: RideStatsRow["coasters"],
): {
  park_id: number | null;
  length_ft: number | null;
  speed_mph: number | null;
  height_ft: number | null;
  inversions: number | null;
  duration_s: number | null;
  parks: { country: string | null } | { country: string | null }[] | null;
} | null {
  if (!coasters) return null;
  return Array.isArray(coasters) ? (coasters[0] ?? null) : coasters;
}

function asParkObject(
  parks: { country: string | null } | { country: string | null }[] | null | undefined,
): { country: string | null } | null {
  if (!parks) return null;
  return Array.isArray(parks) ? (parks[0] ?? null) : parks;
}

function computeUserStats(rows: RideStatsRow[]): Record<string, UserStats> {
  const coasterSets = new Map<string, Set<number>>();
  const parkSets = new Map<string, Set<number>>();
  const countrySets = new Map<string, Set<string>>();
  const longestFtByUser = new Map<string, number>();
  const tallestFtByUser = new Map<string, number>();
  const fastestMphByUser = new Map<string, number>();
  const mostInversionsByUser = new Map<string, number>();
  const longestDurationByUser = new Map<string, number>();

  for (const row of rows) {
    const coasterSet = coasterSets.get(row.user_id) ?? new Set<number>();
    coasterSet.add(row.coaster_id);
    coasterSets.set(row.user_id, coasterSet);

    const coaster = asCoasterObject(row.coasters);
    const parkId = coaster?.park_id;
    if (parkId != null) {
      const parkSet = parkSets.get(row.user_id) ?? new Set<number>();
      parkSet.add(parkId);
      parkSets.set(row.user_id, parkSet);
    }

    const country = asParkObject(coaster?.parks)?.country?.trim();
    if (country) {
      const countrySet = countrySets.get(row.user_id) ?? new Set<string>();
      countrySet.add(country);
      countrySets.set(row.user_id, countrySet);
    }

    if (coaster?.length_ft != null) {
      const current = longestFtByUser.get(row.user_id);
      if (current == null || coaster.length_ft > current) longestFtByUser.set(row.user_id, coaster.length_ft);
    }
    if (coaster?.height_ft != null) {
      const current = tallestFtByUser.get(row.user_id);
      if (current == null || coaster.height_ft > current) tallestFtByUser.set(row.user_id, coaster.height_ft);
    }
    if (coaster?.speed_mph != null) {
      const current = fastestMphByUser.get(row.user_id);
      if (current == null || coaster.speed_mph > current) fastestMphByUser.set(row.user_id, coaster.speed_mph);
    }
    if (coaster?.inversions != null) {
      const current = mostInversionsByUser.get(row.user_id);
      if (current == null || coaster.inversions > current) mostInversionsByUser.set(row.user_id, coaster.inversions);
    }
    if (coaster?.duration_s != null) {
      const current = longestDurationByUser.get(row.user_id);
      if (current == null || coaster.duration_s > current) longestDurationByUser.set(row.user_id, coaster.duration_s);
    }
  }

  const userIds = new Set<string>([...coasterSets.keys(), ...parkSets.keys(), ...countrySets.keys()]);
  const stats: Record<string, UserStats> = {};
  for (const id of userIds) {
    stats[id] = {
      coasters: coasterSets.get(id)?.size ?? 0,
      parks: parkSets.get(id)?.size ?? 0,
      countries: countrySets.get(id)?.size ?? 0,
      longestFt: longestFtByUser.get(id) ?? null,
      tallestFt: tallestFtByUser.get(id) ?? null,
      fastestMph: fastestMphByUser.get(id) ?? null,
      mostInversions: mostInversionsByUser.get(id) ?? null,
      longestDurationS: longestDurationByUser.get(id) ?? null,
    };
  }
  return stats;
}

function metricLabel(value: number | null, unitSuffix?: string): string {
  if (value == null) return "N/A";
  if (unitSuffix) return `${value.toLocaleString()} ${unitSuffix}`;
  return value.toLocaleString();
}

function durationLabel(seconds: number | null): string {
  if (seconds == null) return "N/A";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

type StatTrend = "higher" | "faster" | "longer" | "more";

function comparisonTag(
  sideValue: number | null,
  otherValue: number | null,
  trend: StatTrend,
): string | null {
  if (sideValue == null || otherValue == null) return null;
  if (sideValue === otherValue) return null;
  const better = sideValue > otherValue;
  if (trend === "faster") return better ? "FASTER" : "SLOWER";
  if (trend === "longer") return better ? "LONGER" : "SHORTER";
  if (trend === "more") return better ? "MORE" : "FEWER";
  return better ? "HIGHER" : "LOWER";
}

export default function FriendsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [parksById, setParksById] = useState<Record<number, ParkRow>>({});
  const [coastersById, setCoastersById] = useState<Record<number, CoasterRow>>({});
  const [statsByUserId, setStatsByUserId] = useState<Record<string, UserStats>>({});
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProfileRow[]>([]);
  const [selectedCompareUserId, setSelectedCompareUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadData(activeUserId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const [{ data: profile }, { data: friendRows, error: friendErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, display_name, country_code, favorite_ride_id, favorite_park_id")
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

    setMyProfile((profile as ProfileRow | null) ?? null);
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
      setStatsByUserId({});
      return;
    }

    const { data: relatedProfiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, country_code, favorite_ride_id, favorite_park_id")
      .in("user_id", [...relatedIds]);

    const map: Record<string, ProfileRow> = {};
    for (const p of (relatedProfiles ?? []) as ProfileRow[]) {
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

    const statsUsers = [activeUserId, ...relatedIds];
    const { data: statRows } = await supabase
      .from("rides")
      .select("user_id, coaster_id, coasters(park_id, length_ft, speed_mph, height_ft, inversions, duration_s, parks(country))")
      .in("user_id", statsUsers);
    setStatsByUserId(computeUserStats((statRows ?? []) as RideStatsRow[]));
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
  const myStats = useMemo<UserStats>(
    () => (
      userId
        ? statsByUserId[userId] ?? {
            coasters: 0,
            parks: 0,
            countries: 0,
            longestFt: null,
            tallestFt: null,
            fastestMph: null,
            mostInversions: null,
            longestDurationS: null,
          }
        : {
            coasters: 0,
            parks: 0,
            countries: 0,
            longestFt: null,
            tallestFt: null,
            fastestMph: null,
            mostInversions: null,
            longestDurationS: null,
          }
    ),
    [statsByUserId, userId],
  );
  const acceptedFriendIds = useMemo(() => {
    if (!userId) return [] as string[];
    return acceptedFriends.map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id));
  }, [acceptedFriends, userId]);
  const activeCompareUserId = selectedCompareUserId && acceptedFriendIds.includes(selectedCompareUserId)
    ? selectedCompareUserId
    : null;
  const comparedFriendProfile = activeCompareUserId ? profilesById[activeCompareUserId] : null;
  const comparedFriendStats: UserStats | null = activeCompareUserId
    ? (statsByUserId[activeCompareUserId] ?? {
        coasters: 0,
        parks: 0,
        countries: 0,
        longestFt: null,
        tallestFt: null,
        fastestMph: null,
        mostInversions: null,
        longestDurationS: null,
      })
    : null;

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
      .select("user_id, display_name, country_code, favorite_ride_id, favorite_park_id")
      .ilike("display_name", `%${q}%`)
      .neq("user_id", userId)
      .limit(20);
    setSearching(false);

    if (error) {
      setToast(error.message ?? "Search failed.");
      return;
    }

    setSearchResults((data ?? []) as ProfileRow[]);
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
            <h1 className="text-2xl font-bold text-slate-900">Friends</h1>
            <p className="mt-1 text-sm text-slate-500">
              Compare stats with friends and keep your coaster crew connected.
            </p>
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
                      return (
                        <li key={profile.user_id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <div>
                            <p className="font-medium text-slate-900">{profileLabel(profile, profile.user_id)}</p>
                            <p className="text-xs text-slate-500">
                              {countryNameFromCode(profile.country_code)}
                              {relation?.status === "accepted" ? " · Friend" : ""}
                              {relation?.status === "pending"
                                ? relation.requester_id === userId
                                  ? " · Request sent"
                                  : " · Requested you"
                                : ""}
                            </p>
                          </div>
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
                            <p className="font-medium text-slate-900">{profileLabel(other, otherId)}</p>
                            <p className="text-xs text-slate-500">{countryNameFromCode(other?.country_code)}</p>
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
                          <li key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                            <div>
                              <p className="font-medium text-slate-900">{profileLabel(other, otherId)}</p>
                              <p className="text-xs text-slate-500">{countryNameFromCode(other?.country_code)}</p>
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
                  Comparison includes all logged rides, including kiddie/family rides.
                </p>
                {acceptedFriends.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No friends yet. Send your first request above.</p>
                ) : (
                  <>
                    <ul className="mt-3 space-y-2">
                      {acceptedFriends.map((row) => {
                        const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
                        const other = profilesById[otherId];
                        const isSelected = selectedCompareUserId === otherId;
                        return (
                          <li key={row.id} className={`rounded-lg border px-3 py-3 ${isSelected ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900">{profileLabel(other, otherId)}</p>
                                <p className="text-xs text-slate-500">{countryNameFromCode(other?.country_code)}</p>
                              </div>
                              <div className="flex w-full gap-2 sm:w-auto">
                                <button
                                  onClick={() => setSelectedCompareUserId((prev) => (prev === otherId ? null : otherId))}
                                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 sm:flex-none"
                                >
                                  {isSelected ? "Hide compare" : "Compare stats"}
                                </button>
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

                    {activeCompareUserId && comparedFriendProfile && comparedFriendStats && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                        <p className="text-sm font-semibold text-slate-900">
                          You vs {profileLabel(comparedFriendProfile, activeCompareUserId)}
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">You</p>
                            <p className="mt-2 text-sm text-slate-700 break-words">Country: {countryNameFromCode(myProfile?.country_code)}</p>
                            <p className="mt-1 text-sm text-slate-700 break-words">Favorite ride: {coasterLabel(myProfile?.favorite_ride_id != null ? coastersById[myProfile.favorite_ride_id] : null)}</p>
                            <p className="mt-1 text-sm text-slate-700 break-words">Favorite park: {parkLabel(myProfile?.favorite_park_id != null ? parksById[myProfile.favorite_park_id] : null)}</p>
                            <div className="mt-4 space-y-3 md:mt-auto">
                              <div className="rounded-md bg-slate-50 p-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Core stats</p>
                                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-700">
                                  <span className="font-medium text-slate-500">Coasters</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{myStats.coasters}</span>
                                    {comparisonTag(myStats.coasters, comparedFriendStats.coasters, "more") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(myStats.coasters, comparedFriendStats.coasters, "more")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Parks</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{myStats.parks}</span>
                                    {comparisonTag(myStats.parks, comparedFriendStats.parks, "more") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(myStats.parks, comparedFriendStats.parks, "more")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Countries</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{myStats.countries}</span>
                                    {comparisonTag(myStats.countries, comparedFriendStats.countries, "more") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(myStats.countries, comparedFriendStats.countries, "more")}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="rounded-md bg-slate-50 p-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Performance records</p>
                                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-700">
                                  <span className="font-medium text-slate-500">Fastest</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{metricLabel(myStats.fastestMph, "mph")}</span>
                                    {comparisonTag(myStats.fastestMph, comparedFriendStats.fastestMph, "faster") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(myStats.fastestMph, comparedFriendStats.fastestMph, "faster")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Tallest</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{metricLabel(myStats.tallestFt, "ft")}</span>
                                    {comparisonTag(myStats.tallestFt, comparedFriendStats.tallestFt, "higher") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(myStats.tallestFt, comparedFriendStats.tallestFt, "higher")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Longest</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{metricLabel(myStats.longestFt, "ft")}</span>
                                    {comparisonTag(myStats.longestFt, comparedFriendStats.longestFt, "longer") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(myStats.longestFt, comparedFriendStats.longestFt, "longer")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Most inversions</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{metricLabel(myStats.mostInversions)}</span>
                                    {comparisonTag(myStats.mostInversions, comparedFriendStats.mostInversions, "more") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(myStats.mostInversions, comparedFriendStats.mostInversions, "more")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Longest ride</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{durationLabel(myStats.longestDurationS)}</span>
                                    {comparisonTag(myStats.longestDurationS, comparedFriendStats.longestDurationS, "longer") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(myStats.longestDurationS, comparedFriendStats.longestDurationS, "longer")}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {profileLabel(comparedFriendProfile, activeCompareUserId)}
                            </p>
                            <p className="mt-2 text-sm text-slate-700 break-words">Country: {countryNameFromCode(comparedFriendProfile.country_code)}</p>
                            <p className="mt-1 text-sm text-slate-700 break-words">Favorite ride: {coasterLabel(comparedFriendProfile.favorite_ride_id != null ? coastersById[comparedFriendProfile.favorite_ride_id] : null)}</p>
                            <p className="mt-1 text-sm text-slate-700 break-words">Favorite park: {parkLabel(comparedFriendProfile.favorite_park_id != null ? parksById[comparedFriendProfile.favorite_park_id] : null)}</p>
                            <div className="mt-4 space-y-3 md:mt-auto">
                              <div className="rounded-md bg-slate-50 p-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Core stats</p>
                                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-700">
                                  <span className="font-medium text-slate-500">Coasters</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{comparedFriendStats.coasters}</span>
                                    {comparisonTag(comparedFriendStats.coasters, myStats.coasters, "more") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(comparedFriendStats.coasters, myStats.coasters, "more")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Parks</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{comparedFriendStats.parks}</span>
                                    {comparisonTag(comparedFriendStats.parks, myStats.parks, "more") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(comparedFriendStats.parks, myStats.parks, "more")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Countries</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{comparedFriendStats.countries}</span>
                                    {comparisonTag(comparedFriendStats.countries, myStats.countries, "more") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(comparedFriendStats.countries, myStats.countries, "more")}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="rounded-md bg-slate-50 p-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Performance records</p>
                                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-700">
                                  <span className="font-medium text-slate-500">Fastest</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{metricLabel(comparedFriendStats.fastestMph, "mph")}</span>
                                    {comparisonTag(comparedFriendStats.fastestMph, myStats.fastestMph, "faster") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(comparedFriendStats.fastestMph, myStats.fastestMph, "faster")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Tallest</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{metricLabel(comparedFriendStats.tallestFt, "ft")}</span>
                                    {comparisonTag(comparedFriendStats.tallestFt, myStats.tallestFt, "higher") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(comparedFriendStats.tallestFt, myStats.tallestFt, "higher")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Longest</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{metricLabel(comparedFriendStats.longestFt, "ft")}</span>
                                    {comparisonTag(comparedFriendStats.longestFt, myStats.longestFt, "longer") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(comparedFriendStats.longestFt, myStats.longestFt, "longer")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Most inversions</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{metricLabel(comparedFriendStats.mostInversions)}</span>
                                    {comparisonTag(comparedFriendStats.mostInversions, myStats.mostInversions, "more") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(comparedFriendStats.mostInversions, myStats.mostInversions, "more")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-500">Longest ride</span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{durationLabel(comparedFriendStats.longestDurationS)}</span>
                                    {comparisonTag(comparedFriendStats.longestDurationS, myStats.longestDurationS, "longer") && (
                                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                        {comparisonTag(comparedFriendStats.longestDurationS, myStats.longestDurationS, "longer")}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </AuthGate>
      </main>
    </div>
  );
}
