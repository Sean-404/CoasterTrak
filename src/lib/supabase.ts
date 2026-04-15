"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let userLookupInFlight: Promise<User | null> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  browserClient = createClient(url, anonKey);
  return browserClient;
}

function isInvalidRefreshTokenError(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("invalid refresh token") || m.includes("refresh token not found");
}

function isAuthLockContentionError(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("lock:sb-") && m.includes("auth-token") && m.includes("another request stole it");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readUserFromSessionFallback(supabase: SupabaseClient): Promise<User | null> {
  const { data, error } = await supabase.auth.getSession();
  if (!error) return data.session?.user ?? null;
  if (isInvalidRefreshTokenError(error.message)) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
  return null;
}

/**
 * Safe user lookup for client components. When stale local auth tokens are present
 * (common in local dev after key rotations), clear local auth state and return null.
 */
export async function getSupabaseUserSafe(): Promise<User | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  if (userLookupInFlight) return userLookupInFlight;

  userLookupInFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error) return data.user ?? null;

      if (isInvalidRefreshTokenError(error.message)) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        return null;
      }

      // In local dev/HMR, concurrent auth reads can contend on Supabase's token lock.
      // Fallback to session user so UI actions don't hard-fail.
      if (isAuthLockContentionError(error.message)) {
        await delay(25);
        return await readUserFromSessionFallback(supabase);
      }

      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAuthLockContentionError(message)) {
        await delay(25);
        return await readUserFromSessionFallback(supabase);
      }
      return null;
    } finally {
      userLookupInFlight = null;
    }
  })();

  return userLookupInFlight;
}
