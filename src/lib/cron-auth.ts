import { NextResponse } from "next/server";

/** Returns a JSON error response if cron auth fails; otherwise `null` (caller may proceed). */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.SYNC_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SYNC_CRON_SECRET not configured" }, { status: 500 });
  }

  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function jsonSyncError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Unknown sync error";
  return NextResponse.json({ error: message }, { status: 500 });
}
