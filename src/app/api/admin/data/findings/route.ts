import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import { isCoasterDefunct } from "@/lib/coaster-status";

export const FINDING_TYPES = [
  "name_mismatch_candidate",
  "park_match_candidate",
  "source_attraction_unmatched",
  "local_coaster_missing_in_source",
  "park_unmapped",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

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
  coasters: { name: string; status: string | null; closing_year: number | null } | null;
};

export type FindingTypeCount = {
  finding_type: string;
  count: number;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeFinding(row: Record<string, unknown>): DataFindingRow {
  const parks = unwrapOne(row.parks as { name: string } | { name: string }[] | null);
  const coasters = unwrapOne(
    row.coasters as
      | { name: string; status: string | null; closing_year: number | null }
      | { name: string; status: string | null; closing_year: number | null }[]
      | null,
  );
  return {
    id: Number(row.id),
    finding_type: String(row.finding_type ?? ""),
    severity: String(row.severity ?? ""),
    title: String(row.title ?? ""),
    detail: (row.detail as Record<string, unknown>) ?? {},
    status: String(row.status ?? ""),
    created_at: String(row.created_at ?? ""),
    park_id: row.park_id == null ? null : Number(row.park_id),
    coaster_id: row.coaster_id == null ? null : Number(row.coaster_id),
    parks,
    coasters,
  };
}

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const type = url.searchParams.get("type")?.trim() || null;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "100") || 100, 1), 300);
  const wantCounts = url.searchParams.get("counts") === "1";

  let counts: FindingTypeCount[] = [];
  if (wantCounts) {
    const { data: countRows, error: countErr } = await ctx.service
      .from("data_review_findings")
      .select("finding_type")
      .eq("status", status);
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }
    const byType = new Map<string, number>();
    for (const row of countRows ?? []) {
      const t = String((row as { finding_type?: string }).finding_type ?? "");
      if (!t) continue;
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    counts = [...byType.entries()]
      .map(([finding_type, count]) => ({ finding_type, count }))
      .sort((a, b) => b.count - a.count);
  }

  let query = ctx.service
    .from("data_review_findings")
    .select(
      "id, finding_type, severity, title, detail, status, created_at, park_id, coaster_id, parks(name), coasters(name, status, closing_year)",
    )
    .eq("status", status)
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type && type !== "all") {
    if (type === "actionable") {
      query = query.in("finding_type", ["name_mismatch_candidate", "park_match_candidate"]);
    } else {
      query = query.eq("finding_type", type);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const findings = (data ?? []).map((row) => normalizeFinding(row as Record<string, unknown>));
  const totalOpen = counts.reduce((sum, c) => sum + c.count, 0);

  return NextResponse.json({
    findings,
    counts,
    totalOpen: wantCounts ? totalOpen : undefined,
  });
}

type BulkBody =
  | { action: "bulk_ignore"; types: string[] }
  | { action: "bulk_ignore"; ids: number[] }
  | { action: "bulk_ignore"; preset: "noise" };

export async function POST(request: Request) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const body = (await request.json().catch(() => null)) as BulkBody | null;
  if (!body || body.action !== "bulk_ignore") {
    return NextResponse.json({ error: "Expected action bulk_ignore" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let ignored = 0;

  if ("ids" in body && Array.isArray(body.ids)) {
    const ids = body.ids.map(Number).filter((id) => Number.isFinite(id));
    if (!ids.length) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }
    const { error, count } = await ctx.service
      .from("data_review_findings")
      .update({ status: "ignored", resolved_at: now }, { count: "exact" })
      .eq("status", "open")
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ignored = count ?? ids.length;
    return NextResponse.json({ ok: true, ignored });
  }

  if ("preset" in body && body.preset === "noise") {
    // 1) All unmapped parks (ThemeParks coverage gaps).
    const { error: parkErr, count: parkCount } = await ctx.service
      .from("data_review_findings")
      .update({ status: "ignored", resolved_at: now }, { count: "exact" })
      .eq("status", "open")
      .eq("finding_type", "park_unmapped");
    if (parkErr) return NextResponse.json({ error: parkErr.message }, { status: 500 });
    ignored += parkCount ?? 0;

    // 2) Catalog rides missing from ThemeParks that are already defunct.
    const { data: missingRows, error: missingErr } = await ctx.service
      .from("data_review_findings")
      .select("id, coasters(status, closing_year)")
      .eq("status", "open")
      .eq("finding_type", "local_coaster_missing_in_source");
    if (missingErr) return NextResponse.json({ error: missingErr.message }, { status: 500 });

    const defunctIds: number[] = [];
    for (const row of missingRows ?? []) {
      const coaster = unwrapOne(
        (row as { coasters?: { status: string | null; closing_year: number | null } | { status: string | null; closing_year: number | null }[] | null })
          .coasters,
      );
      if (!coaster) continue;
      if (
        isCoasterDefunct({
          status: coaster.status ?? "Unknown",
          closing_year: coaster.closing_year,
        })
      ) {
        defunctIds.push(Number((row as { id: number }).id));
      }
    }

    for (let i = 0; i < defunctIds.length; i += 200) {
      const chunk = defunctIds.slice(i, i + 200);
      const { error, count } = await ctx.service
        .from("data_review_findings")
        .update({ status: "ignored", resolved_at: now }, { count: "exact" })
        .eq("status", "open")
        .in("id", chunk);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ignored += count ?? chunk.length;
    }

    return NextResponse.json({ ok: true, ignored });
  }

  if ("types" in body && Array.isArray(body.types)) {
    const types = body.types.map(String).filter(Boolean);
    if (!types.length) {
      return NextResponse.json({ error: "No types provided" }, { status: 400 });
    }
    const { error, count } = await ctx.service
      .from("data_review_findings")
      .update({ status: "ignored", resolved_at: now }, { count: "exact" })
      .eq("status", "open")
      .in("finding_type", types);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ignored = count ?? 0;
    return NextResponse.json({ ok: true, ignored });
  }

  return NextResponse.json({ error: "Invalid bulk_ignore payload" }, { status: 400 });
}
