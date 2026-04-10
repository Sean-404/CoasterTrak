"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyAuthError(err: { message: string; status?: number; code?: string }) {
  const code = (err as Record<string, unknown>).code as string | undefined;
  if (err.status === 429 || code === "over_email_send_rate_limit") {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (code === "email_address_invalid" || err.message?.includes("email")) {
    return "That email address couldn't be verified. Please double-check it and try again.";
  }
  if (code === "user_already_exists") {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (err.message === "Invalid login credentials") {
    return "Incorrect email or password.";
  }
  return err.message || "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/stats");
    });
  }, [router]);

  function validate() {
    if (!EMAIL_RE.test(email)) { setError("Enter a valid email address."); return false; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return false; }
    if (mode === "signup" && password !== confirmPassword) { setError("Passwords do not match."); return false; }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!validate()) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError("Supabase is not configured."); return; }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data: signUpData, error: err } = await supabase.auth.signUp({ email, password });
        setLoading(false);
        if (err) { setError(friendlyAuthError(err)); return; }
        // If auto-confirm is on, the session is returned immediately
        if (signUpData.session) {
          router.push("/stats");
          router.refresh();
        } else {
          setInfo("Account created! Check your email to confirm, then sign in.");
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        if (err) { setError(friendlyAuthError(err)); return; }
        router.push("/stats");
        router.refresh();
      }
    } catch {
      setLoading(false);
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "signin" ? "Sign in to your CoasterTrak account." : "Start tracking every rollercoaster you ride."}
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Email"
              autoComplete="email"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
            />
            {mode === "signup" && (
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Confirm password"
                autoComplete="new-password"
                required
              />
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            {info && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            {mode === "signin" ? (
              <>No account?{" "}
                <button onClick={() => { setMode("signup"); setError(""); setInfo(""); }} className="font-semibold text-slate-900 underline underline-offset-2">
                  Sign up
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={() => { setMode("signin"); setError(""); setInfo(""); }} className="font-semibold text-slate-900 underline underline-offset-2">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
