"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import { validateDisplayName } from "@/lib/display-name";

export default function AccountPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void getSupabaseUserSafe().then((user) => {
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);
      setEmail(user.email ?? "");
      void supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            setProfileError("Could not load profile. Please try again.");
          } else {
            setDisplayName(data?.display_name ?? "");
          }
          setLoading(false);
        });
    });
  }, [router]);

  async function saveDisplayName(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!userId) {
      setProfileError("Please sign in again.");
      return;
    }

    const validation = validateDisplayName(displayName);
    if (!validation.ok) {
      setProfileError(validation.reason);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setProfileSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          display_name: validation.normalized,
        },
        { onConflict: "user_id" },
      );
    setProfileSaving(false);

    if (error) {
      const message = (error.message ?? "").toLowerCase();
      const isDuplicate = message.includes("profiles_display_name_lower_uidx") || message.includes("duplicate key");
      setProfileError(isDuplicate ? "That display name is already taken." : "Could not save display name. Try a different name.");
      return;
    }

    setDisplayName(validation.normalized);
    setProfileSuccess("Display name saved.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 8) { setPwError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPwError("Passwords do not match."); return; }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);

    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Account</h1>
        {loading ? (
          <p className="text-slate-500">Loading&hellip;</p>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Signed in as</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{email}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Display name</p>
              <p className="mt-1 text-sm text-slate-700">
                {displayName.trim() ? displayName : "Not set yet"}
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Public display name</h2>
              <p className="mt-1 text-sm text-slate-500">
                This is what other users will see in social features. Emails and private details are never shown.
              </p>
              <form onSubmit={saveDisplayName} className="mt-3 space-y-3">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setProfileError("");
                    setProfileSuccess("");
                  }}
                  placeholder="Enter display name"
                  autoComplete="nickname"
                  maxLength={24}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                <p className="text-xs text-slate-500">
                  3-24 chars. Letters/numbers, spaces, dot, dash, underscore. Must start/end with a letter or number.
                </p>
                {profileError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{profileError}</p>}
                {profileSuccess && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{profileSuccess}</p>}
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="cursor-pointer rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {profileSaving ? "Saving..." : "Save display name"}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Change password</h2>
              <form onSubmit={changePassword} className="mt-3 space-y-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPwError(""); }}
                  placeholder="New password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPwError(""); }}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                {pwError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{pwError}</p>}
                {pwSuccess && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{pwSuccess}</p>}
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="cursor-pointer rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pwLoading ? "Updating\u2026" : "Update password"}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Sign out</h2>
              <p className="mt-1 text-sm text-slate-500">You&apos;ll be returned to the home page.</p>
              <button
                onClick={signOut}
                className="mt-4 cursor-pointer rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
              >
                Sign out
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
