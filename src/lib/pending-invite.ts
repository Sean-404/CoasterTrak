import type { SupabaseClient } from "@supabase/supabase-js";
import { requestFriendNotification } from "@/lib/friend-notify-client";

export const INVITE_STORAGE_KEY = "ct_pending_invite";

export function storePendingInvite(inviterUserId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INVITE_STORAGE_KEY,
      JSON.stringify({ userId: inviterUserId, savedAt: Date.now() }),
    );
  } catch {
    // Ignore quota / private mode.
  }
}

export function peekPendingInvite(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(INVITE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; savedAt?: number };
    if (!parsed?.userId || typeof parsed.userId !== "string") return null;
    if (parsed.savedAt && Date.now() - parsed.savedAt > 14 * 24 * 60 * 60 * 1000) {
      window.localStorage.removeItem(INVITE_STORAGE_KEY);
      return null;
    }
    return parsed.userId;
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INVITE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * After signup/signin, create a pending friend request to the stored inviter (if any).
 */
export async function consumePendingInvite(
  supabase: SupabaseClient,
  currentUserId: string,
): Promise<"sent" | "skipped" | "error"> {
  const inviterId = peekPendingInvite();
  if (!inviterId || inviterId === currentUserId) {
    clearPendingInvite();
    return "skipped";
  }

  const { data: existing } = await supabase
    .from("friendships")
    .select("id, status, requester_id, addressee_id")
    .or(
      `and(requester_id.eq.${currentUserId},addressee_id.eq.${inviterId}),and(requester_id.eq.${inviterId},addressee_id.eq.${currentUserId})`,
    )
    .maybeSingle();

  if (
    existing?.status === "accepted" ||
    existing?.status === "blocked" ||
    existing?.status === "pending"
  ) {
    clearPendingInvite();
    return "skipped";
  }

  if (existing?.status === "declined") {
    const { data: updated, error } = await supabase
      .from("friendships")
      .update({
        status: "pending",
        requester_id: currentUserId,
        addressee_id: inviterId,
      })
      .eq("id", existing.id)
      .select("id")
      .maybeSingle();
    if (error || !updated) return "error";
    void requestFriendNotification("friend_request", String(updated.id));
    clearPendingInvite();
    return "sent";
  }

  const { data: inserted, error } = await supabase
    .from("friendships")
    .insert({
      requester_id: currentUserId,
      addressee_id: inviterId,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted) return "error";

  void requestFriendNotification("friend_request", String(inserted.id));
  clearPendingInvite();
  return "sent";
}
