"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const missing = window.setTimeout(() => {
        setChecking(false);
        setError("Supabase is not configured.");
      }, 0);
      return () => window.clearTimeout(missing);
    }

    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    if (hashParams.get("error") || hashParams.get("error_code")) {
      const errorCode = hashParams.get("error_code") ?? "";
      const invalid = window.setTimeout(() => {
        if (errorCode === "otp_expired" || errorCode === "otp_disabled") {
          router.replace("/login?expired=1");
          return;
        }
        setChecking(false);
        setError("That reset link is invalid. Request a new one from the login page.");
      }, 0);
      return () => window.clearTimeout(invalid);
    }

    const query = new URLSearchParams(window.location.search);
    const code = query.get("code");

    let settled = false;
    const markReady = () => {
      if (settled) return;
      settled = true;
      setReady(true);
      setChecking(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        markReady();
        return;
      }
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        const type = hashParams.get("type");
        if (type === "recovery" || event === "PASSWORD_RECOVERY") markReady();
      }
    });

    void (async () => {
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError) {
          markReady();
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (data.session && hashParams.get("type") === "recovery") {
        markReady();
      }
    })();

    const timeout = window.setTimeout(() => {
      if (settled) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          markReady();
          return;
        }
        setChecking(false);
        setError("That reset link is invalid or has expired. Request a new one from the login page.");
      });
    }, 2500);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message || "Could not update password. Please try again.");
      return;
    }
    setInfo("Password updated. Taking you to your stats…");
    router.replace("/stats");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="font-bungee text-2xl leading-tight text-slate-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">
            This page is only for the link from your reset email.
          </p>

          {checking ? (
            <p className="mt-6 text-sm text-slate-500">Checking reset link…</p>
          ) : ready ? (
            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="New password"
                autoComplete="new-password"
                required
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError("");
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
              />
              {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
              {info ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{info}</p> : null}
              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-50"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          ) : (
            <div className="mt-6 space-y-3">
              {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
              <Link
                href="/login?expired=1"
                className="inline-block text-sm font-semibold text-slate-900 underline underline-offset-2 hover:text-amber-600"
              >
                Request a new reset link
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
