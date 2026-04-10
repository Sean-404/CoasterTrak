"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setIsAuthed(Boolean(data.user));
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session?.user));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <p className="py-12 text-center text-slate-500">Loading&hellip;</p>;
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
