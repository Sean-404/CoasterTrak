"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type Status = "loading" | "idle" | "loading-wishlist" | "loading-ridden" | "wishlisted" | "ridden" | "error";

export function CoasterActions({
  coasterId,
  disableWishlist = false,
}: {
  coasterId: number;
  disableWishlist?: boolean;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [alreadyRidden, setAlreadyRidden] = useState(false);
  const [alreadyWishlisted, setAlreadyWishlisted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { setStatus("idle"); return; }
      const user = await getSupabaseUserSafe();
      if (!user || cancelled) { setStatus("idle"); return; }
      const uid = user.id;

      const [ridesRes, wishRes] = await Promise.all([
        supabase.from("rides").select("id").eq("user_id", uid).eq("coaster_id", coasterId).maybeSingle(),
        supabase
          .from("wishlist")
          .select("coaster_id")
          .eq("user_id", uid)
          .eq("coaster_id", coasterId)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      if (ridesRes.error || wishRes.error) {
        setStatus("error");
        setErrorMsg("Could not load ride state.");
        return;
      }
      if (ridesRes.data) setAlreadyRidden(true);
      if (wishRes.data) setAlreadyWishlisted(true);
      setStatus("idle");
    }
    check();
    return () => { cancelled = true; };
  }, [coasterId]);

  async function withUser(action: (userId: string) => Promise<void>) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setStatus("error"); setErrorMsg("Supabase not configured."); return; }
    const user = await getSupabaseUserSafe();
    if (!user) { setStatus("error"); setErrorMsg("Sign in to track rides."); return; }
    await action(user.id);
  }

  async function addWishlist() {
    if (status !== "idle") return;
    setStatus("loading-wishlist");
    await withUser(async (userId) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { error } = await supabase
        .from("wishlist")
        .upsert(
          { user_id: userId, coaster_id: coasterId },
          { onConflict: "user_id,coaster_id", ignoreDuplicates: true },
        );
      if (error) { setStatus("error"); setErrorMsg(error.message); }
      else { setStatus("wishlisted"); setAlreadyWishlisted(true); }
    });
  }

  async function markRidden() {
    if (status !== "idle") return;
    setStatus("loading-ridden");
    await withUser(async (userId) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { error } = await supabase.from("rides").upsert({ user_id: userId, coaster_id: coasterId }, { onConflict: "user_id,coaster_id", ignoreDuplicates: true });
      if (error) { setStatus("error"); setErrorMsg(error.message); }
      else {
        if (alreadyWishlisted) {
          await supabase.from("wishlist").delete().eq("user_id", userId).eq("coaster_id", coasterId);
          setAlreadyWishlisted(false);
        }
        setStatus("ridden"); setAlreadyRidden(true);
      }
    });
  }

  if (status === "loading") return null;

  const busy = status === "loading-wishlist" || status === "loading-ridden";
  const showFeedback = status === "wishlisted" || status === "ridden" || status === "error";

  return (
    <div className="mt-2 min-h-[32px]">
      {showFeedback ? (
        <p className={`text-xs font-medium ${status === "error" ? "text-red-500" : "text-green-600"}`}>
          {status === "wishlisted" && "Added to wishlist"}
          {status === "ridden" && "Ride logged!"}
          {status === "error" && errorMsg}
        </p>
      ) : (
        <div className="flex items-center gap-1.5">
          {alreadyRidden && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Ridden</span>
          )}
          {alreadyWishlisted && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Wishlisted</span>
          )}
          {!disableWishlist && !alreadyWishlisted && !alreadyRidden && (
            <button
              onClick={addWishlist}
              disabled={busy}
              className="cursor-pointer rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
            >
              {status === "loading-wishlist" ? "Saving…" : "Wishlist"}
            </button>
          )}
          {!alreadyRidden && (
            <button
              onClick={markRidden}
              disabled={busy}
              className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60"
            >
              {status === "loading-ridden" ? "Saving…" : "Mark ridden"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
