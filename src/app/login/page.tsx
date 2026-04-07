"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Use email + password to sign up or sign in.");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/stats");
    });
  }, [router]);

  async function signUp() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Add Supabase env vars first.");
      return;
    }

    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Signup successful. Check your email if confirmation is enabled.");
  }

  async function signIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Add Supabase env vars first.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Signed in successfully. Redirecting...");
    router.push("/stats");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md p-6">
        <div className="rounded border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Account access</h1>
          <p className="mt-1 text-sm text-slate-600">Create an account to use wishlist and stats.</p>
          <div className="mt-4 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="Email"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="Password"
            />
            <div className="flex gap-2">
              <button onClick={signIn} className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
                Sign in
              </button>
              <button onClick={signUp} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-900">
                Sign up
              </button>
            </div>
            <p className="text-sm text-slate-600">{message}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
