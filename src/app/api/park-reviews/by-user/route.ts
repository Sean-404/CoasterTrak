import { NextResponse } from "next/server";
import { isNextResponse, requireBearerUser } from "@/lib/auth-request";
import { getApprovedReviewsByUser, getOwnReviews } from "@/lib/park-reviews-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Reviews for a member's stats page. Your own reviews come back in every status (so you can
 * see what is waiting for a moderator); anyone else's are the approved ones, which are already
 * public on park pages under their display name.
 */
export async function GET(request: Request) {
  const ctx = await requireBearerUser(request);
  if (isNextResponse(ctx)) return ctx;

  const userId = new URL(request.url).searchParams.get("userId")?.trim() ?? "";
  if (!USER_ID_RE.test(userId)) return NextResponse.json({ error: "Unknown member." }, { status: 400 });

  try {
    const reviews =
      userId === ctx.user.id ? await getOwnReviews(ctx.service, userId) : await getApprovedReviewsByUser(userId);
    return NextResponse.json({ reviews: reviews ?? [] });
  } catch (error) {
    console.error("[park-reviews/by-user]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Reviews are not available right now." }, { status: 503 });
  }
}
