"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type Status = "loading" | "idle" | "loading-wishlist" | "loading-ridden" | "wishlisted" | "ridden" | "error";

type ActionStore = {
  ready: boolean;
  userId: string | null;
  error: string | null;
  ridden: Set<number>;
  wishlisted: Set<number>;
};

const actionStore: ActionStore = {
  ready: false,
  userId: null,
  error: null,
  ridden: new Set<number>(),
  wishlisted: new Set<number>(),
};

let actionStoreInitPromise: Promise<void> | null = null;
const actionStoreListeners = new Set<() => void>();

function emitActionStoreChange() {
  for (const listener of actionStoreListeners) listener();
}

function subscribeActionStore(listener: () => void) {
  actionStoreListeners.add(listener);
  return () => {
    actionStoreListeners.delete(listener);
  };
}

async function ensureActionStoreLoaded(forceRefresh = false) {
  if (actionStore.ready && !forceRefresh) return;
  if (actionStoreInitPromise) return actionStoreInitPromise;

  actionStoreInitPromise = (async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      actionStore.ready = true;
      actionStore.userId = null;
      actionStore.error = null;
      actionStore.ridden = new Set<number>();
      actionStore.wishlisted = new Set<number>();
      emitActionStoreChange();
      return;
    }

    const user = await getSupabaseUserSafe();
    if (!user) {
      actionStore.ready = true;
      actionStore.userId = null;
      actionStore.error = null;
      actionStore.ridden = new Set<number>();
      actionStore.wishlisted = new Set<number>();
      emitActionStoreChange();
      return;
    }

    const userId = user.id;
    const [ridesRes, wishRes] = await Promise.all([
      supabase.from("rides").select("coaster_id").eq("user_id", userId),
      supabase.from("wishlist").select("coaster_id").eq("user_id", userId),
    ]);
    if (ridesRes.error || wishRes.error) {
      actionStore.ready = true;
      actionStore.userId = userId;
      actionStore.error = "Could not load ride state.";
      emitActionStoreChange();
      return;
    }

    actionStore.ready = true;
    actionStore.userId = userId;
    actionStore.error = null;
    actionStore.ridden = new Set((ridesRes.data ?? []).map((row) => row.coaster_id as number));
    actionStore.wishlisted = new Set((wishRes.data ?? []).map((row) => row.coaster_id as number));
    emitActionStoreChange();
  })().finally(() => {
    actionStoreInitPromise = null;
  });

  return actionStoreInitPromise;
}

function setWishlisted(coasterId: number, value: boolean) {
  if (value) actionStore.wishlisted.add(coasterId);
  else actionStore.wishlisted.delete(coasterId);
  emitActionStoreChange();
}

function setRidden(coasterId: number, value: boolean) {
  if (value) actionStore.ridden.add(coasterId);
  else actionStore.ridden.delete(coasterId);
  emitActionStoreChange();
}

export function CoasterActions({
  coasterId,
  disableWishlist = false,
}: {
  coasterId: number;
  disableWishlist?: boolean;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [storeTick, setStoreTick] = useState(0);

  const alreadyRidden = actionStore.ridden.has(coasterId);
  const alreadyWishlisted = actionStore.wishlisted.has(coasterId);

  useEffect(() => {
    const unsubscribe = subscribeActionStore(() => {
      setStoreTick((x) => x + 1);
    });
    // Force one shared refresh when action controls mount so stale cache from other pages
    // (e.g. removing a ridden ride in stats) doesn't block re-adding here.
    void ensureActionStoreLoaded(true).then(() => {
      if (actionStore.error) {
        setStatus("error");
        setErrorMsg(actionStore.error);
      } else {
        setStatus("idle");
      }
    });
    return unsubscribe;
  }, []);

  async function withUser(action: (userId: string) => Promise<void>) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setStatus("error"); setErrorMsg("Supabase not configured."); return; }
    await ensureActionStoreLoaded();
    const userId = actionStore.userId;
    if (!userId) { setStatus("error"); setErrorMsg("Sign in to track rides."); return; }
    await action(userId);
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
      else { setStatus("wishlisted"); setWishlisted(coasterId, true); }
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
          setWishlisted(coasterId, false);
        }
        setStatus("ridden");
        setRidden(coasterId, true);
      }
    });
  }

  if (status === "loading" || !actionStore.ready) return null;

  const busy = status === "loading-wishlist" || status === "loading-ridden";
  const showFeedback = status === "wishlisted" || status === "ridden" || status === "error";

  return (
    <div className="mt-2 min-h-[32px]" data-store-tick={storeTick}>
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
