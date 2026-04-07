"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function SiteHeader() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setIsAuthed(Boolean(data.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session?.user));
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <Link href="/" className="text-xl font-bold text-slate-900">
          CoasterTrak
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/map" className="text-slate-700 hover:text-slate-900">
            Map
          </Link>
          <Link href="/wishlist" className="text-slate-700 hover:text-slate-900">
            Wishlist
          </Link>
          <Link href="/stats" className="text-slate-700 hover:text-slate-900">
            Stats
          </Link>
          {isAuthed ? (
            <>
              <Link href="/account" className="rounded border border-slate-300 px-3 py-2 text-slate-900">
                Account
              </Link>
              <button onClick={signOut} className="rounded bg-slate-900 px-3 py-2 text-white">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded bg-slate-900 px-3 py-2 text-white">
              Login
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
