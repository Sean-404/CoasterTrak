"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AppPageHeading } from "@/components/app-page-heading";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SiteHeader } from "@/components/site-header";
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
};

const PROFILE_SELECT =
  "user_id, display_name, country_code, avatar_key, avatar_path";

function countryNameFromCode(code: string | null | undefined): string {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "Unknown country";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
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
      return;
    }
    setError("");
    setProfiles(await withAvatarUrls(supabase, (data ?? []) as PublicProfile[]));
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
      <main className="mx-auto max-w-4xl p-6">
        <AuthGate>
          <div className="mb-6">
            <Link href="/friends" className="text-sm font-medium text-amber-700 underline-offset-2 hover:underline">
              ← Friends
            </Link>
            <AppPageHeading className="mt-2">Public profiles</AppPageHeading>
            <p className="mt-1 text-sm text-slate-500">
              People who made their stats public. Open a profile to see ride stats and photos, or add them as a friend.
              Change this in{" "}
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
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <form onSubmit={(e) => void submitSearch(e)} className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search public profiles"
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

              {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

              {profiles.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  {isSearchResult
                    ? "No public users match that name."
                    : "Nobody has made their profile public yet. Set yours to Public in Account to appear here."}
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {profiles.map((profile) => {
                    const relation = relationshipByOtherId.get(profile.user_id);
                    const canAdd = !relation || relation.status === "declined";
                    return (
                      <li
                        key={profile.user_id}
                        className="flex flex-col gap-3 rounded-lg border border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
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
                            <p className="truncate text-xs text-slate-500">
                              {countryNameFromCode(profile.country_code)}
                              {relation?.status === "accepted" ? " · Friend" : ""}
                              {relation?.status === "pending"
                                ? relation.requester_id === userId
                                  ? " · Request sent"
                                  : " · Requested you"
                                : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                          <Link
                            href={`/stats?user=${encodeURIComponent(profile.user_id)}`}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Stats
                          </Link>
                          <Link
                            href={`/stats?user=${encodeURIComponent(profile.user_id)}&compare=1`}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Compare
                          </Link>
                          <button
                            type="button"
                            onClick={() => void sendRequest(profile.user_id)}
                            disabled={!canAdd || !hasDisplayName || busyId === profile.user_id}
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
          )}
        </AuthGate>
      </main>
    </div>
  );
}
