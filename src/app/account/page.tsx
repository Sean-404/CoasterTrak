"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setEmail(data.user.email ?? "");
      setLoading(false);
    });
  }, [router]);

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
          <p className="text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Signed in as</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{email}</p>
            </section>

            <section className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Sign out</h2>
              <p className="mt-1 text-sm text-slate-500">You&apos;ll be returned to the home page.</p>
              <button
                onClick={signOut}
                className="mt-4 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
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
