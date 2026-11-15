import { after, NextResponse } from "next/server";
import { isNextResponse, requireBearerUser, type AuthedRequestContext } from "@/lib/auth-request";
import { getParkById, resolveCatalogParkId } from "@/lib/catalog-server";
import { REVIEW_DAILY_LIMIT, isTrustedReviewer, reviewAuthorName, validateParkReview } from "@/lib/park-reviews";
import {
  REVIEW_COLUMNS,
  loadOwnReview,
  loadReviewerTrackRecord,
  revalidateParkReviews,
  toOwnParkReview,
  type ReviewRow,
} from "@/lib/park-reviews-server";
import { buildReviewAlertEmail, reviewAlertRecipient } from "@/lib/review-alert-email";
import { sendTransactionalEmail } from "@/lib/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseParkId(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Reviews are stored against the canonical park so merged duplicates share one list. */
async function resolveReviewPark(rawParkId: unknown): Promise<number | null> {
  const parkId = parseParkId(rawParkId);
  if (!parkId) return null;
  const canonicalId = await resolveCatalogParkId(parkId);
  const park = await getParkById(canonicalId);
  return park ? park.id : null;
}

async function loadAuthorName(ctx: AuthedRequestContext): Promise<string> {
  const { data } = await ctx.service.from("profiles").select("display_name").eq("user_id", ctx.user.id).maybeSingle();
  return reviewAuthorName((data as { display_name: string | null } | null)?.display_name);
}

function unavailable(error: unknown) {
  console.error("[park-reviews]", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Reviews are not available right now." }, { status: 503 });
}

/** The signed-in member's own review for a park, in any status. */
export async function GET(request: Request) {
  const ctx = await requireBearerUser(request);
  if (isNextResponse(ctx)) return ctx;

  const parkId = await resolveReviewPark(new URL(request.url).searchParams.get("parkId"));
  if (!parkId) return NextResponse.json({ error: "Unknown park." }, { status: 400 });

  try {
    return NextResponse.json({ review: await loadOwnReview(ctx.service, ctx.user.id, parkId) });
  } catch (error) {
    return unavailable(error);
  }
}

/** Create or edit the member's review. Every save goes back to moderation. */
export async function PUT(request: Request) {
  const ctx = await requireBearerUser(request);
  if (isNextResponse(ctx)) return ctx;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parkId = await resolveReviewPark(payload.parkId);
  if (!parkId) return NextResponse.json({ error: "Unknown park." }, { status: 400 });

  const validation = validateParkReview(payload);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  try {
    const record = await loadReviewerTrackRecord(ctx.service, ctx.user.id, parkId);
    if (record.banned) {
      return NextResponse.json({ error: "This account cannot post reviews." }, { status: 403 });
    }
    const trusted = isTrustedReviewer(record);

    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { count, error: countError } = await ctx.service
      .from("park_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.user.id)
      .neq("park_id", parkId)
      .gte("updated_at", since);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= REVIEW_DAILY_LIMIT) {
      return NextResponse.json(
        { error: `You can review up to ${REVIEW_DAILY_LIMIT} parks a day. Try again tomorrow.` },
        { status: 429 },
      );
    }

    const previous = await loadOwnReview(ctx.service, ctx.user.id, parkId);
    const { data, error } = await ctx.service
      .from("park_reviews")
      .upsert(
        {
          user_id: ctx.user.id,
          park_id: parkId,
          rating: validation.value.rating,
          body: validation.value.body,
          visited_year: validation.value.visitedYear,
          // Trusted members publish straight away; moderated_by stays null to mark it as automatic.
          status: trusted ? "approved" : "pending",
          moderated_at: trusted ? new Date().toISOString() : null,
          moderated_by: null,
        },
        { onConflict: "user_id,park_id" },
      )
      .select(REVIEW_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    // Park pages change when a review publishes, or when an edit takes a published one back to the queue.
    if (trusted || previous?.status === "approved") await revalidateParkReviews(parkId);

    if (!trusted) {
      const authorName = await loadAuthorName(ctx);
      const park = await getParkById(parkId);
      const email = buildReviewAlertEmail({
        parkName: park?.name ?? `Park ${parkId}`,
        authorName,
        rating: validation.value.rating,
        body: validation.value.body,
        isEdit: previous != null,
      });
      // Send after responding so a slow email provider never holds up the member.
      after(async () => {
        const result = await sendTransactionalEmail({ to: reviewAlertRecipient(), ...email });
        if (!result.ok && !result.skipped) console.warn("[park-reviews] alert email failed:", result.error);
      });
    }

    return NextResponse.json({ review: toOwnParkReview(data as ReviewRow) });
  } catch (error) {
    return unavailable(error);
  }
}

/** Delete the member's own review. */
export async function DELETE(request: Request) {
  const ctx = await requireBearerUser(request);
  if (isNextResponse(ctx)) return ctx;

  const parkId = await resolveReviewPark(new URL(request.url).searchParams.get("parkId"));
  if (!parkId) return NextResponse.json({ error: "Unknown park." }, { status: 400 });

  try {
    const previous = await loadOwnReview(ctx.service, ctx.user.id, parkId);
    if (!previous) return NextResponse.json({ ok: true });
    const { error } = await ctx.service
      .from("park_reviews")
      .delete()
      .eq("user_id", ctx.user.id)
      .eq("park_id", parkId);
    if (error) throw new Error(error.message);
    if (previous.status === "approved") await revalidateParkReviews(parkId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return unavailable(error);
  }
}
