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
    });
  }, []);

  if (loading) {
    return <p className="text-slate-600">Checking session...</p>;
  }

  if (!isAuthed) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="mb-2">You need to sign in to access this page.</p>
        <Link href="/login" className="font-semibold underline">
          Go to login
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
