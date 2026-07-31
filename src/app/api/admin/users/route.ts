import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  country_code: string | null;
  avatar_key: string | null;
  banned_at: string | null;
  ban_reason: string | null;
  updated_at: string | null;
};

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters." }, { status: 400 });
  }

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

  let query = ctx.service
    .from("profiles")
    .select("user_id, display_name, country_code, avatar_key, banned_at, ban_reason, updated_at")
    .order("display_name", { ascending: true })
    .limit(25);

  query = uuidLike ? query.eq("user_id", q) : query.ilike("display_name", `%${q}%`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Could not search users." }, { status: 500 });
  }

  return NextResponse.json({ users: (data ?? []) as ProfileRow[] });
}
