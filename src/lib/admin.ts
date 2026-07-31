import type { User } from "@supabase/supabase-js";

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.app_metadata as { role?: unknown } | undefined)?.role;
  return role === "admin";
}
