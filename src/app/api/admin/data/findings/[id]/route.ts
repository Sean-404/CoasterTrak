import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import { aliasKeyFromName } from "@/lib/data-platform/coaster-aliases";

type ActionBody =
  | { action: "ignore" }
  | { action: "save_alias"; catalogName: string; feedName: string; parkId?: number | null }
  | { action: "rename_to_feed"; feedName: string }
  | { action: "apply_field"; fieldName: "height_ft" | "speed_mph" | "length_ft"; value: number; sourceUrl?: string };

function orderedAliasKeys(a: string, b: string): { key_a: string; key_b: string } {
  const ka = aliasKeyFromName(a);
  const kb = aliasKeyFromName(b);
  return ka < kb ? { key_a: ka, key_b: kb } : { key_a: kb, key_b: ka };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const { id: idRaw } = await context.params;
  const findingId = Number(idRaw);
  if (!Number.isFinite(findingId)) {
    return NextResponse.json({ error: "Invalid finding id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as ActionBody | null;
  if (!body?.action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const { data: finding, error: findErr } = await ctx.service
    .from("data_review_findings")
    .select("id, park_id, coaster_id, detail, finding_type")
    .eq("id", findingId)
    .maybeSingle();

  if (findErr || !finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (body.action === "ignore") {
    const { error } = await ctx.service
      .from("data_review_findings")
      .update({ status: "ignored", resolved_at: now })
      .eq("id", findingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save_alias") {
    const keys = orderedAliasKeys(body.catalogName, body.feedName);
    if (!keys.key_a || !keys.key_b || keys.key_a === keys.key_b) {
      return NextResponse.json({ error: "Invalid alias names" }, { status: 400 });
    }
    const parkId = body.parkId ?? finding.park_id ?? null;
    const { error: aliasErr } = await ctx.service.from("data_coaster_name_aliases").upsert(
      {
        ...keys,
        park_id: parkId,
        source: "review",
        approved: true,
      },
      { onConflict: "key_a,key_b,park_id" },
    );
    if (aliasErr) return NextResponse.json({ error: aliasErr.message }, { status: 500 });

    const { error } = await ctx.service
      .from("data_review_findings")
      .update({ status: "resolved", resolved_at: now })
      .eq("id", findingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, alias: keys });
  }

  if (body.action === "rename_to_feed") {
    if (!finding.coaster_id) {
      return NextResponse.json({ error: "Finding has no coaster" }, { status: 400 });
    }
    const { error: renameErr } = await ctx.service
      .from("coasters")
      .update({ name: body.feedName.trim() })
      .eq("id", finding.coaster_id);
    if (renameErr) return NextResponse.json({ error: renameErr.message }, { status: 500 });

    const { error } = await ctx.service
      .from("data_review_findings")
      .update({ status: "resolved", resolved_at: now })
      .eq("id", findingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "apply_field") {
    if (!finding.coaster_id) {
      return NextResponse.json({ error: "Finding has no coaster" }, { status: 400 });
    }
    const field = body.fieldName;
    const value = Math.round(body.value);

    const { error: overrideErr } = await ctx.service.from("data_coaster_field_overrides").upsert(
      {
        coaster_id: finding.coaster_id,
        field_name: field,
        value_int: value,
        source: "review",
        source_url: body.sourceUrl ?? null,
        approved: true,
      },
      { onConflict: "coaster_id,field_name" },
    );
    if (overrideErr) return NextResponse.json({ error: overrideErr.message }, { status: 500 });

    const { error: coasterErr } = await ctx.service
      .from("coasters")
      .update({ [field]: value })
      .eq("id", finding.coaster_id);
    if (coasterErr) return NextResponse.json({ error: coasterErr.message }, { status: 500 });

    const { error } = await ctx.service
      .from("data_review_findings")
      .update({ status: "resolved", resolved_at: now })
      .eq("id", findingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
