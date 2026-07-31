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
  if (!userId) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  const { error: profileError } = await ctx.service
    .from("profiles")
    .update({ banned_at: null, ban_reason: null })
    .eq("user_id", userId);

  if (profileError) {
    return NextResponse.json({ error: "Could not clear profile ban." }, { status: 500 });
  }

  const { error: authError } = await ctx.service.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (authError) {
    return NextResponse.json({ error: "Profile unbanned, but Auth unban failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
