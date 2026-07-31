import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const { userId } = await context.params;
  if (!userId || userId === ctx.user.id) {
    return NextResponse.json({ error: "You cannot clear your own display name this way." }, { status: 400 });
  }

  const { error } = await ctx.service
    .from("profiles")
    .update({ display_name: null })
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Could not clear display name." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
