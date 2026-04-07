"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [message, setMessage] = useState("Loading account...");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? "");
      setMessage("");
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
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Account settings</h1>
        {message ? (
          <p className="text-slate-600">{message}</p>
        ) : (
          <section className="rounded border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">Signed in as</p>
            <p className="text-lg font-medium text-slate-900">{email}</p>
            <button onClick={signOut} className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm text-white">
              Sign out
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
