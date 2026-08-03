import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";

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

const PROFILE_SELECT =
  "user_id, display_name, country_code, avatar_key, banned_at, ban_reason, updated_at";

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

  if (q && q.length < 2 && !uuidLike) {
    return NextResponse.json({ error: "Query must be at least 2 characters." }, { status: 400 });
  }

  if (!q) {
    const { data, error } = await fetchAllPages<ProfileRow>(SUPABASE_PAGE_SIZE, (from, to) =>
      ctx.service
        .from("profiles")
        .select(PROFILE_SELECT)
        .order("display_name", { ascending: true, nullsFirst: false })
        .order("user_id", { ascending: true })
        .range(from, to),
    );

    if (error) {
      return NextResponse.json({ error: "Could not list users." }, { status: 500 });
    }

    return NextResponse.json({ users: data });
  }

  let query = ctx.service
    .from("profiles")
    .select(PROFILE_SELECT)
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("user_id", { ascending: true })
    .limit(100);

  query = uuidLike ? query.eq("user_id", q) : query.ilike("display_name", `%${q}%`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Could not search users." }, { status: 500 });
  }

  return NextResponse.json({ users: (data ?? []) as ProfileRow[] });
}
