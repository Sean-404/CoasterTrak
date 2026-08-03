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
    return NextResponse.json({ error: "You cannot ban yourself." }, { status: 400 });
  }

  let reason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason === "string") {
      const trimmed = body.reason.trim();
      reason = trimmed ? trimmed.slice(0, 200) : null;
    }
  } catch {
    reason = null;
  }

  const { error: profileError } = await ctx.service.from("profiles").upsert(
    {
      user_id: userId,
      banned_at: new Date().toISOString(),
      ban_reason: reason,
      display_name: null,
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    return NextResponse.json({ error: "Could not update ban on profile." }, { status: 500 });
  }

  const { error: authError } = await ctx.service.auth.admin.updateUserById(userId, {
    ban_duration: "876600h",
  });

  if (authError) {
    return NextResponse.json({ error: "Profile banned, but Auth ban failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
