"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

const STORAGE_KEY = "ct_last_seen_ping_ms";
const PING_EVERY_MS = 10 * 60 * 1000;

/**
 * Soft presence heartbeat for signed-in users.
 * Writes profiles.last_seen_at (throttled) so admin can see who is regularly active,
 * independent of auth last_sign_in_at (which stays stale for persistent sessions).
 */
export function PresenceBeacon() {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const user = await getSupabaseUserSafe();
      if (!user || cancelled) return;

      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const last = raw ? Number(raw) : 0;
        if (Number.isFinite(last) && Date.now() - last < PING_EVERY_MS) return;
      } catch {
        // sessionStorage may be unavailable
      }

      const { error } = await supabase.rpc("touch_profile_last_seen");
      if (error || cancelled) return;

      try {
        sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    }

    void ping();
    const onFocus = () => {
      void ping();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
