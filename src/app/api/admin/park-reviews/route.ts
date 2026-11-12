import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import { getParkById } from "@/lib/catalog-server";
import { reviewAuthorName } from "@/lib/park-reviews";
import { REVIEW_COLUMNS, loadReviewAuthors, type ReviewRow } from "@/lib/park-reviews-server";
import { parkSlug } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS = ["pending", "reported", "approved", "hidden"] as const;
type Filter = (typeof FILTERS)[number];
const LIST_LIMIT = 200;

export type AdminParkReview = {
  id: number;
  status: string;
  rating: number | null;
  body: string;
  visitedYear: number | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  authorName: string;
  authorBanned: boolean;
  parkId: number;
  parkName: string;
  parkHref: string | null;
  openReports: { reason: string | null; createdAt: string }[];
};

type ReportRow = { review_id: number; reason: string | null; created_at: string };

/** Moderation queue: pending reviews by default, or reported / approved / hidden ones. */
export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const rawFilter = new URL(request.url).searchParams.get("filter") ?? "pending";
  const filter: Filter = (FILTERS as readonly string[]).includes(rawFilter) ? (rawFilter as Filter) : "pending";

  try {
    const { data: openReportData, error: reportError } = await ctx.service
      .from("park_review_reports")
      .select("review_id,reason,created_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (reportError) throw new Error(reportError.message);
    const reportsByReview = new Map<number, ReportRow[]>();
    for (const report of (openReportData ?? []) as ReportRow[]) {
      const list = reportsByReview.get(report.review_id) ?? [];
      list.push(report);
      reportsByReview.set(report.review_id, list);
    }

    let query = ctx.service.from("park_reviews").select(REVIEW_COLUMNS);
    if (filter === "reported") {
      const ids = [...reportsByReview.keys()];
      if (ids.length === 0) return NextResponse.json({ reviews: [], counts: await countByStatus(ctx.service, 0) });
      query = query.in("id", ids);
    } else {
      query = query.eq("status", filter);
    }
    const { data, error } = await query
      .order("updated_at", { ascending: filter === "pending" })
      .limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ReviewRow[];

    const authors = await loadReviewAuthors(
      ctx.service,
      rows.map((r) => r.user_id),
    );
    const parkIds = [...new Set(rows.map((r) => r.park_id))];
    const parks = new Map(
      await Promise.all(parkIds.map(async (id) => [id, await getParkById(id)] as const)),
    );

    const reviews: AdminParkReview[] = rows.map((row) => {
      const park = parks.get(row.park_id);
      const author = authors.get(row.user_id);
      return {
        id: row.id,
        status: row.status,
        rating: row.rating,
        body: row.body,
        visitedYear: row.visited_year,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        userId: row.user_id,
        authorName: reviewAuthorName(author?.display_name),
        authorBanned: Boolean(author?.banned_at),
        parkId: row.park_id,
        parkName: park?.name ?? `Park ${row.park_id}`,
        parkHref: park ? `/parks/${parkSlug(park.name, park.id)}` : null,
        openReports: (reportsByReview.get(row.id) ?? []).map((r) => ({ reason: r.reason, createdAt: r.created_at })),
      };
    });

    return NextResponse.json({ reviews, counts: await countByStatus(ctx.service, reportsByReview.size) });
  } catch (error) {
    console.error("[admin/park-reviews]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not load reviews. Has the park_reviews migration been applied?" },
      { status: 500 },
    );
  }
}

async function countByStatus(
  service: Parameters<typeof loadReviewAuthors>[0],
  reported: number,
): Promise<Record<Filter, number>> {
  const statuses = ["pending", "approved", "hidden"] as const;
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count } = await service
        .from("park_reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return [status, count ?? 0] as const;
    }),
  );
  return { ...(Object.fromEntries(counts) as Record<(typeof statuses)[number], number>), reported };
}
