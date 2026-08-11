import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";

export type DataFindingRow = {
  id: number;
  finding_type: string;
  severity: string;
  title: string;
  detail: Record<string, unknown>;
  status: string;
  created_at: string;
  park_id: number | null;
  coaster_id: number | null;
  parks: { name: string } | null;
  coasters: { name: string } | null;
};

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 200);

  const { data, error } = await ctx.service
    .from("data_review_findings")
    .select(
      "id, finding_type, severity, title, detail, status, created_at, park_id, coaster_id, parks(name), coasters(name)",
    )
    .eq("status", status)
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ findings: data ?? [] });
}
