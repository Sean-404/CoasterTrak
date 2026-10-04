import { NextResponse } from "next/server";
import { isNextResponse, requireBearerUser } from "@/lib/auth-request";
import {
  buildFriendAcceptedEmail,
  buildFriendRequestEmail,
} from "@/lib/friend-notify";
import { prefsFromProfileRow } from "@/lib/notification-prefs";
import { sendTransactionalEmail } from "@/lib/transactional-email";

type NotifyBody = {
  type?: string;
  friendshipId?: string;
};

export async function POST(request: Request) {
  const ctx = await requireBearerUser(request);
  if (isNextResponse(ctx)) return ctx;

  let body: NotifyBody;
  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type;
  const friendshipId = body.friendshipId?.trim();
  if ((type !== "friend_request" && type !== "friend_accepted") || !friendshipId) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data: friendship, error: friendshipError } = await ctx.service
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .maybeSingle();

  if (friendshipError || !friendship) {
    return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
  }

  const requesterId = String(friendship.requester_id);
  const addresseeId = String(friendship.addressee_id);
  const status = String(friendship.status);

  let recipientUserId: string;
  let actorUserId: string;
  let prefKey: "notifyFriendRequests" | "notifyFriendAccepted";

  if (type === "friend_request") {
    if (ctx.user.id !== requesterId || status !== "pending") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    recipientUserId = addresseeId;
    actorUserId = requesterId;
    prefKey = "notifyFriendRequests";
  } else {
    if (ctx.user.id !== addresseeId || status !== "accepted") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    recipientUserId = requesterId;
    actorUserId = addresseeId;
    prefKey = "notifyFriendAccepted";
  }

  const { data: recipientProfile } = await ctx.service
    .from("profiles")
    .select("notify_friend_requests, notify_friend_accepted")
    .eq("user_id", recipientUserId)
    .maybeSingle();

  const prefs = prefsFromProfileRow(recipientProfile);
  if (!prefs[prefKey]) {
    return NextResponse.json({ ok: true, skipped: true, reason: "opted_out" });
  }

  const { data: actorProfile } = await ctx.service
    .from("profiles")
    .select("display_name")
    .eq("user_id", actorUserId)
    .maybeSingle();

  const { data: authData, error: authError } = await ctx.service.auth.admin.getUserById(
    recipientUserId,
  );
  if (authError || !authData.user?.email) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_email" });
  }

  const actorDisplayName = actorProfile?.display_name?.trim() || "Someone";
  const email =
    type === "friend_request"
      ? buildFriendRequestEmail({ recipientUserId, actorDisplayName })
      : buildFriendAcceptedEmail({ recipientUserId, actorDisplayName });

  const result = await sendTransactionalEmail({
    to: authData.user.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (!result.ok) {
    // Friendship action already succeeded; don't fail the request over email delivery.
    console.error("[friends/notify] email not sent:", result.error);
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: result.skipped ? "not_configured" : "delivery_failed",
      error: result.error,
    });
  }

  return NextResponse.json({ ok: true, id: result.id });
}
