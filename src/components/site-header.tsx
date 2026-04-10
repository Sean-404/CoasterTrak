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
    <header className="border-b border-white/10 bg-slate-950">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-bungee text-xl tracking-wide text-amber-400 transition hover:text-amber-300">
          CoasterTrak
        </Link>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/map" className="text-slate-400 transition hover:text-white">
            Map
          </Link>
          <Link href="/wishlist" className="text-slate-400 transition hover:text-white">
            Wishlist
          </Link>
          <Link href="/stats" className="text-slate-400 transition hover:text-white">
            Stats
          </Link>
          {isAuthed ? (
            <>
              <Link href="/account" className="rounded-lg border border-white/20 px-3 py-1.5 text-white transition hover:border-white/40">
                Account
              </Link>
              <button onClick={signOut} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-900 transition hover:bg-amber-400">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-900 transition hover:bg-amber-400">
              Login
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
