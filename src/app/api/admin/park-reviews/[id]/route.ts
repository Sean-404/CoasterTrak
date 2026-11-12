import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import { revalidateParkReviews } from "@/lib/park-reviews-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Action = "approve" | "hide" | "clear-reports";

/**
 * Approve or hide a review, or dismiss its open reports. Approving or hiding also resolves
 * open reports, since the moderator has made a call on the review.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const { id: rawId } = await context.params;
  const reviewId = Number(rawId);
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return NextResponse.json({ error: "Unknown review." }, { status: 400 });
  }

  let action: Action | null = null;
  try {
    const body = (await request.json()) as { action?: unknown };
    if (body.action === "approve" || body.action === "hide" || body.action === "clear-reports") {
      action = body.action;
    }
  } catch {
    action = null;
  }
  if (!action) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  try {
    const { data: existing, error: readError } = await ctx.service
      .from("park_reviews")
      .select("id,park_id,status")
      .eq("id", reviewId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    const review = existing as { id: number; park_id: number; status: string } | null;
    if (!review) return NextResponse.json({ error: "Unknown review." }, { status: 404 });

    const now = new Date().toISOString();
    if (action !== "clear-reports") {
      const { error } = await ctx.service
        .from("park_reviews")
        .update({
          status: action === "approve" ? "approved" : "hidden",
          moderated_at: now,
          moderated_by: ctx.user.id,
        })
        .eq("id", reviewId);
      if (error) throw new Error(error.message);
    }

    const { error: reportError } = await ctx.service
      .from("park_review_reports")
      .update({ resolved_at: now })
      .eq("review_id", reviewId)
      .is("resolved_at", null);
    if (reportError) throw new Error(reportError.message);

    const visibilityChanged =
      action !== "clear-reports" && (review.status === "approved" || action === "approve");
    if (visibilityChanged) await revalidateParkReviews(review.park_id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/park-reviews/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not update the review." }, { status: 500 });
  }
}
