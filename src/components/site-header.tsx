"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

export function SiteHeader() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void getSupabaseUserSafe().then((user) => {
      setIsAuthed(Boolean(user));
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session?.user));
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const coreNavLinks = (
    <>
      <Link href="/map" onClick={() => setMenuOpen(false)} className="text-slate-400 transition hover:text-white">
        Map
      </Link>
      <Link href="/wishlist" onClick={() => setMenuOpen(false)} className="text-slate-400 transition hover:text-white">
        Wishlist
      </Link>
      <Link href="/stats" onClick={() => setMenuOpen(false)} className="text-slate-400 transition hover:text-white">
        Stats
      </Link>
      <Link href="/friends" onClick={() => setMenuOpen(false)} className="text-slate-400 transition hover:text-white">
        Friends
      </Link>
      <Link href="/achievements" onClick={() => setMenuOpen(false)} className="text-slate-400 transition hover:text-white">
        Achievements
      </Link>
    </>
  );

  return (
    <header className="border-b border-white/10 bg-slate-950">
      <nav className="mx-auto flex min-h-[3.75rem] max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="font-bungee text-lg leading-none tracking-wide text-amber-400 transition hover:text-amber-300 sm:text-xl">
          CoasterTrak
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-5 text-sm sm:flex">
          {coreNavLinks}
          <span className="inline-flex min-w-[12.5rem] items-center justify-end gap-2">
            {!authReady ? (
              <>
                <span
                  className="h-8 w-[4.75rem] animate-pulse rounded-lg bg-white/15"
                  aria-hidden
                />
                <span
                  className="h-8 w-[5.5rem] animate-pulse rounded-lg bg-white/15"
                  aria-hidden
                />
              </>
            ) : isAuthed ? (
              <>
                <Link href="/account" onClick={() => setMenuOpen(false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-white transition hover:border-white/40">
                  Account
                </Link>
                <button onClick={signOut} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-900 transition hover:bg-amber-400">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <span className="invisible rounded-lg border border-white/20 px-3 py-1.5">
                  Account
                </span>
                <Link href="/login" onClick={() => setMenuOpen(false)} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-900 transition hover:bg-amber-400">
                  Login
                </Link>
              </>
            )}
          </span>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="sm:hidden rounded p-1.5 text-slate-400 transition hover:text-white"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 text-sm sm:hidden">
          <div className="flex flex-col gap-2">
            {coreNavLinks}
          </div>
          <div className="flex gap-2 pt-1">
            {!authReady ? (
              <>
                <span className="h-9 flex-1 animate-pulse rounded-lg bg-white/15" aria-hidden />
                <span className="h-9 flex-1 animate-pulse rounded-lg bg-white/15" aria-hidden />
              </>
            ) : isAuthed ? (
              <>
                <Link
                  href="/account"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 rounded-lg border border-white/20 px-3 py-2 text-center text-white transition hover:border-white/40"
                >
                  Account
                </Link>
                <button
                  onClick={signOut}
                  className="flex-1 rounded-lg bg-amber-500 px-3 py-2 font-semibold text-slate-900 transition hover:bg-amber-400"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-center font-semibold text-slate-900 transition hover:bg-amber-400"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
