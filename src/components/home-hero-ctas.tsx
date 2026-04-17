"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseUserSafe } from "@/lib/supabase";

export function HomeHeroCtas() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let active = true;
    void getSupabaseUserSafe().then((user) => {
      if (!active) return;
      setIsAuthed(Boolean(user));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        href="/map"
        className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-amber-400 active:scale-95"
      >
        Open map &rarr;
      </Link>
      <Link
        href="/coaster-tracker"
        className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
      >
        What is CoasterTrak?
      </Link>
      {isAuthed ? (
        <Link
          href="/account"
          className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
        >
          Account
        </Link>
      ) : (
        <Link
          href="/login"
          className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
        >
          Create account
        </Link>
      )}
    </div>
  );
}
