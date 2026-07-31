"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    async function syncAuth() {
      const user = await getSupabaseUserSafe();
      if (!user) {
        setIsAuthed(false);
        setIsBanned(false);
        setLoading(false);
        return;
      }

      const { data } = await supabase!
        .from("profiles")
        .select("banned_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.banned_at) {
        setIsBanned(true);
        setIsAuthed(false);
        await supabase!.auth.signOut({ scope: "local" }).catch(() => {});
        setLoading(false);
        return;
      }

      setIsBanned(false);
      setIsAuthed(true);
      setLoading(false);
    }

    void syncAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setIsAuthed(false);
        setIsBanned(false);
        setLoading(false);
        return;
      }
      void syncAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <p className="py-12 text-center text-slate-500">Loading&hellip;</p>;
  }

  if (isBanned) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="rounded-2xl border border-red-200 bg-white p-10 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Account restricted</h2>
          <p className="mt-2 text-sm text-slate-500">
            This account has been banned and can no longer use CoasterTrak social features.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Back home
          </Link>
        </div>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Sign in to continue</h2>
          <p className="mt-2 text-sm text-slate-500">
            You need an account to access this page.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
          >
            Sign in
          </Link>
          <p className="mt-3 text-xs text-slate-400">
            Don&apos;t have an account?{" "}
            <Link href="/login" className="font-semibold text-slate-600 underline underline-offset-2">
              Create one
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
