"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

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

/**
 * Safe user lookup for client components. When stale local auth tokens are present
 * (common in local dev after key rotations), clear local auth state and return null.
 */
export async function getSupabaseUserSafe(): Promise<User | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (!error) return data.user ?? null;

  if (isInvalidRefreshTokenError(error.message)) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return null;
  }

  return null;
}
