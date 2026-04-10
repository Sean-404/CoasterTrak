"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function SiteHeader() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setIsAuthed(Boolean(data.user));
    }).catch(() => {});

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

  const navLinks = (
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
      {isAuthed ? (
        <>
          <Link href="/account" onClick={() => setMenuOpen(false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-white transition hover:border-white/40">
            Account
          </Link>
          <button onClick={signOut} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-900 transition hover:bg-amber-400">
            Sign out
          </button>
        </>
      ) : (
        <Link href="/login" onClick={() => setMenuOpen(false)} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-900 transition hover:bg-amber-400">
          Login
        </Link>
      )}
    </>
  );

  return (
    <header className="border-b border-white/10 bg-slate-950">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-bungee text-xl tracking-wide text-amber-400 transition hover:text-amber-300">
          CoasterTrak
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-5 text-sm sm:flex">
          {navLinks}
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
        <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 text-sm sm:hidden">
          {navLinks}
        </div>
      )}
    </header>
  );
}
