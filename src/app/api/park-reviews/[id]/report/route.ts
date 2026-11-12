import { NextResponse } from "next/server";
import { isNextResponse, requireBearerUser } from "@/lib/auth-request";
import { normalizeReportReason } from "@/lib/park-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_REPORT_LIMIT = 20;

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** A member flags an approved review for a moderator to look at. */
export async function POST(request: Request, context: RouteContext) {
  const ctx = await requireBearerUser(request);
  if (isNextResponse(ctx)) return ctx;

  const { id: rawId } = await context.params;
  const reviewId = Number(rawId);
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return NextResponse.json({ error: "Unknown review." }, { status: 400 });
  }

  let reason: string | null = null;
  try {
    reason = normalizeReportReason(((await request.json()) as { reason?: unknown }).reason);
  } catch {
    reason = null;
  }

  try {
    const { data: review, error: reviewError } = await ctx.service
      .from("park_reviews")
      .select("id,user_id,status")
      .eq("id", reviewId)
      .maybeSingle();
    if (reviewError) throw new Error(reviewError.message);
    const row = review as { id: number; user_id: string; status: string } | null;
    if (!row || row.status !== "approved") {
      return NextResponse.json({ error: "Unknown review." }, { status: 404 });
    }
    if (row.user_id === ctx.user.id) {
      return NextResponse.json({ error: "You cannot report your own review." }, { status: 400 });
    }

    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { count, error: countError } = await ctx.service
      .from("park_review_reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", ctx.user.id)
      .gte("created_at", since);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= DAILY_REPORT_LIMIT) {
      return NextResponse.json({ error: "Too many reports today. Try again tomorrow." }, { status: 429 });
    }

    const { error } = await ctx.service
      .from("park_review_reports")
      .upsert(
        { review_id: reviewId, reporter_id: ctx.user.id, reason, resolved_at: null },
        { onConflict: "review_id,reporter_id" },
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[park-reviews/report]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Reports are not available right now." }, { status: 503 });
  }
}
