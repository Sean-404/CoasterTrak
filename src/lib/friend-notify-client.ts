"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";

export type FriendNotifyType = "friend_request" | "friend_accepted";

/** Fire-and-forget; never blocks the friends UI if email fails. */
export async function requestFriendNotification(
  type: FriendNotifyType,
  friendshipId: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !friendshipId) return;

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch("/api/friends/notify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, friendshipId }),
    });
  } catch {
    // Ignore — friendship action already succeeded.
  }
}
