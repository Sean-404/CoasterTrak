"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Status = "idle" | "loading-wishlist" | "loading-ridden" | "wishlisted" | "ridden" | "error";

export function CoasterActions({ coasterId }: { coasterId: number }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function withUser(action: (userId: string) => Promise<void>) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setStatus("error"); setErrorMsg("Supabase not configured."); return; }
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setStatus("error"); setErrorMsg("Sign in to track rides."); return; }
    await action(data.user.id);
  }

  async function addWishlist() {
    if (status !== "idle") return;
    setStatus("loading-wishlist");
    await withUser(async (userId) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { error } = await supabase.from("wishlist").upsert({ user_id: userId, coaster_id: coasterId });
      if (error) { setStatus("error"); setErrorMsg(error.message); }
      else setStatus("wishlisted");
    });
  }

  async function markRidden() {
    if (status !== "idle") return;
    setStatus("loading-ridden");
    await withUser(async (userId) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { error } = await supabase.from("rides").insert({ user_id: userId, coaster_id: coasterId });
      if (error) { setStatus("error"); setErrorMsg(error.message); }
      else setStatus("ridden");
    });
  }

  const busy = status === "loading-wishlist" || status === "loading-ridden";
  const done = status === "wishlisted" || status === "ridden";

  return (
    // min-h keeps height stable so the popup doesn't jump when feedback appears
    <div className="mt-2 min-h-[52px]">
      {done || status === "error" ? (
        <p className={`text-xs font-medium ${status === "error" ? "text-red-500" : "text-green-600"}`}>
          {status === "wishlisted" && "Added to wishlist"}
          {status === "ridden" && "Ride logged!"}
          {status === "error" && errorMsg}
        </p>
      ) : (
        <div className="flex gap-1.5">
          <button
            onClick={addWishlist}
            disabled={busy}
            className="cursor-pointer rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "loading-wishlist" ? "Saving…" : "Wishlist"}
          </button>
          <button
            onClick={markRidden}
            disabled={busy}
            className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "loading-ridden" ? "Saving…" : "Mark ridden"}
          </button>
        </div>
      )}
    </div>
  );
}
