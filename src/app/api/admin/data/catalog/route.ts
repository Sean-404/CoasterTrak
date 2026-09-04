import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import {
  loadCatalogQualitySnapshot,
  type CatalogAiReview,
  type CatalogAiReviewAssessment,
  type CatalogQualityFinding,
  type CatalogQualitySnapshot,
  type CatalogReviewItem,
} from "@/lib/catalog-quality-storage";

export type { CatalogAiReview, CatalogAiReviewAssessment, CatalogQualityFinding, CatalogQualitySnapshot, CatalogReviewItem };

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const url = new URL(request.url);
  const reviewType = url.searchParams.get("reviewType")?.trim() || null;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "100") || 100, 1), 400);

  const snapshot = await loadCatalogQualitySnapshot(ctx.service);

  if (reviewType && snapshot.reviewQueue) {
    const filtered = snapshot.reviewQueue.items.filter((item) => {
      if (reviewType === "duplicates") {
        return item.type === "POSSIBLE_DUPLICATE";
      }
      if (reviewType === "country") {
        return item.type === "COUNTRY_CONFLICT";
      }
      if (reviewType === "suspicious") {
        return item.type === "SUSPICIOUS_VALUE";
      }
      if (reviewType === "missing") {
        return item.type === "MISSING_DATA";
      }
      return item.type.toLowerCase() === reviewType.toLowerCase();
    });

    return NextResponse.json({
      ...snapshot,
      reviewItems: filtered.slice(0, limit),
    });
  }

  const topFindings = snapshot.report?.findings.slice(0, limit) ?? [];

  return NextResponse.json({
    ...snapshot,
    topFindings,
  });
}
