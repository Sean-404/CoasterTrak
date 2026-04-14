import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

const SYNC_RATE_WINDOW_MS = 60_000;
const SYNC_RATE_LIMIT = 30;

type RateBucket = {
  count: number;
  resetAt: number;
};

const syncRateBuckets = new Map<string, RateBucket>();

function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function safeTokenEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Basic in-memory limiter to reduce brute-force/noise on sync endpoints. */
export function requireSyncRateLimit(request: Request): NextResponse | null {
  const now = Date.now();
  const ip = getRequestIp(request);
  const route = new URL(request.url).pathname;
  const key = `${route}:${ip}`;
  const existing = syncRateBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    syncRateBuckets.set(key, { count: 1, resetAt: now + SYNC_RATE_WINDOW_MS });
    return null;
  }

  existing.count += 1;
  if (existing.count > SYNC_RATE_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  return null;
}

/** Returns a JSON error response if cron auth fails; otherwise `null` (caller may proceed). */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.SYNC_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SYNC_CRON_SECRET not configured" }, { status: 500 });
  }

  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  if (!token || !safeTokenEquals(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function jsonSyncError(error: unknown): NextResponse {
  // Keep internals in logs, return generic message to callers.
  console.error("Catalog sync failed", error);
  return NextResponse.json({ error: "Catalog sync failed" }, { status: 500 });
}
