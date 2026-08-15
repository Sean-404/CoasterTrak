import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import { adminClearProfileAvatar } from "@/lib/admin-user-photos";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const { userId } = await context.params;
  if (!userId || userId === ctx.user.id) {
    return NextResponse.json({ error: "You cannot clear your own photo this way." }, { status: 400 });
  }

  const { error } = await adminClearProfileAvatar(ctx.service, userId);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
