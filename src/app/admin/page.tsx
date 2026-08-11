"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SiteHeader } from "@/components/site-header";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type AdminUserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  country_code: string | null;
  avatar_key: string | null;
  banned_at: string | null;
  ban_reason: string | null;
  auth_banned: boolean;
  has_profile: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  updated_at: string | null;
};

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function adminFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Not signed in.");
  }
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; users?: AdminUserRow[] };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminUserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadUsers = useCallback(async (search: string) => {
    setError("");
    setMessage("");
    setSearching(true);
    try {
      const trimmed = search.trim();
      const path = trimmed
        ? `/api/admin/users?q=${encodeURIComponent(trimmed)}`
        : "/api/admin/users";
      const payload = await adminFetch(path);
      setResults(payload.users ?? []);
      if (!(payload.users ?? []).length) {
        setMessage(trimmed ? "No matching users." : "No users found.");
      }
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Could not load users.");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void getSupabaseUserSafe().then((user) => {
      const isAdmin = isAdminUser(user);
      setAllowed(isAdmin);
      setLoading(false);
      if (isAdmin) {
        void loadUsers("");
      }
    });
  }, [loadUsers]);

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    await loadUsers(query);
  }

  async function clearName(userId: string) {
    if (!window.confirm("Clear this user's display name?")) return;
    setBusyId(userId);
    setError("");
    setMessage("");
    try {
      await adminFetch(`/api/admin/users/${userId}/clear-name`, { method: "POST" });
      setResults((rows) => rows.map((row) => (row.user_id === userId ? { ...row, display_name: null } : row)));
      setMessage("Display name cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear name.");
    } finally {
      setBusyId(null);
    }
  }

  async function banUser(userId: string) {
    const reason = window.prompt("Ban reason (optional):") ?? "";
    if (!window.confirm("Ban this user? They will be signed out and hidden from search.")) return;
    setBusyId(userId);
    setError("");
    setMessage("");
    try {
      await adminFetch(`/api/admin/users/${userId}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setResults((rows) =>
        rows.map((row) =>
          row.user_id === userId
            ? {
                ...row,
                display_name: null,
                banned_at: new Date().toISOString(),
                ban_reason: reason.trim() || null,
                auth_banned: true,
                has_profile: true,
              }
            : row,
        ),
      );
      setMessage("User banned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ban user.");
    } finally {
      setBusyId(null);
    }
  }

  async function unbanUser(userId: string) {
    if (!window.confirm("Unban this user?")) return;
    setBusyId(userId);
    setError("");
    setMessage("");
    try {
      await adminFetch(`/api/admin/users/${userId}/unban`, { method: "POST" });
      setResults((rows) =>
        rows.map((row) =>
          row.user_id === userId
            ? { ...row, banned_at: null, ban_reason: null, auth_banned: false }
            : row,
        ),
      );
      setMessage("User unbanned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unban user.");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = Boolean(query.trim());

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Trusted operators only. Clear rude names, ban accounts, or review catalog data.
        </p>
        <p className="mt-3">
          <Link
            href="/admin/data"
            className="text-sm font-semibold text-amber-700 underline-offset-2 hover:underline"
          >
            Data review queue →
          </Link>
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : !allowed ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            You do not have admin access.{" "}
            <Link href="/" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
              Back home
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <form onSubmit={submitSearch} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search by name or email
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Leave empty to show all"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="min-w-28 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {searching ? "Loading…" : filtered ? "Search" : "Show all"}
                </button>
              </div>
            </form>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

            {!searching && results.length > 0 ? (
              <p className="text-xs text-slate-500">
                {results.length} user{results.length === 1 ? "" : "s"}
                {filtered ? " matching" : ""}
              </p>
            ) : null}

            {results.length > 0 ? (
              <ul className="space-y-3">
                {results.map((user) => {
                  const banned = Boolean(user.banned_at) || user.auth_banned;
                  return (
                    <li
                      key={user.user_id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <ProfileAvatar avatarKey={user.avatar_key} name={user.display_name || user.email} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">
                            {user.display_name?.trim() || "(no display name)"}
                          </p>
                          <p className="mt-0.5 break-all text-sm text-slate-700">
                            {user.email?.trim() || "(no email)"}
                          </p>
                          <p className="mt-0.5 break-all text-xs text-slate-500">{user.user_id}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {banned
                              ? `Banned${user.ban_reason ? ` · ${user.ban_reason}` : ""}`
                              : "Active"}
                            {!user.has_profile ? " · No profile row" : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Signed up {formatWhen(user.created_at)} · Last sign-in{" "}
                            {formatWhen(user.last_sign_in_at)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busyId === user.user_id || !user.display_name}
                              onClick={() => void clearName(user.user_id)}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Clear name
                            </button>
                            {banned ? (
                              <button
                                type="button"
                                disabled={busyId === user.user_id}
                                onClick={() => void unbanUser(user.user_id)}
                                className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                Unban
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyId === user.user_id}
                                onClick={() => void banUser(user.user_id)}
                                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Ban
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : searching ? (
              <p className="text-sm text-slate-500">Loading users…</p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
