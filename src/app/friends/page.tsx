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
};

function profileLabel(profile: ProfileRow | null | undefined, fallbackId: string): string {
  const name = profile?.display_name?.trim();
  if (name) return name;
  return `User ${fallbackId.slice(0, 8)}`;
}

export default function FriendsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
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
      supabase.from("profiles").select("user_id, display_name, country_code").eq("user_id", activeUserId).maybeSingle(),
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
      return;
    }

    const { data: relatedProfiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, country_code")
      .in("user_id", [...relatedIds]);

    const map: Record<string, ProfileRow> = {};
    for (const p of (relatedProfiles ?? []) as ProfileRow[]) {
      map[p.user_id] = p;
    }
    setProfilesById(map);
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
      .select("user_id, display_name, country_code")
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
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
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
                              {profile.country_code ?? "Unknown country"}
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
                            <p className="text-xs text-slate-500">{other?.country_code ?? "Unknown country"}</p>
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
                              <p className="text-xs text-slate-500">{other?.country_code ?? "Unknown country"}</p>
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
                {acceptedFriends.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No friends yet. Send your first request above.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {acceptedFriends.map((row) => {
                      const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
                      const other = profilesById[otherId];
                      return (
                        <li key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <div>
                            <p className="font-medium text-slate-900">{profileLabel(other, otherId)}</p>
                            <p className="text-xs text-slate-500">{other?.country_code ?? "Unknown country"}</p>
                          </div>
                          <button
                            onClick={() => void removeFriend(row)}
                            disabled={busyId === row.id}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Remove
                          </button>
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
