"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Props = {
  coasterId: number;
};

export function CoasterActions({ coasterId }: Props) {
  const [message, setMessage] = useState("");

  async function withUser(action: (userId: string) => Promise<void>) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setMessage("Please sign in to track rides or wishlist.");
      return;
    }

    await action(data.user.id);
  }

  async function addWishlist() {
    await withUser(async (userId) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { error } = await supabase.from("wishlist").upsert({
        user_id: userId,
        coaster_id: coasterId,
      });

      setMessage(error ? error.message : "Added to wishlist.");
    });
  }

  async function markRidden() {
    await withUser(async (userId) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { error } = await supabase.from("rides").insert({
        user_id: userId,
        coaster_id: coasterId,
      });

      setMessage(error ? error.message : "Ride logged.");
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex gap-2">
        <button className="rounded bg-slate-900 px-2 py-1 text-xs text-white" onClick={addWishlist}>
          Wishlist
        </button>
        <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-800" onClick={markRidden}>
          Mark ridden
        </button>
      </div>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
