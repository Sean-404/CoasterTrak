import { createHmac, timingSafeEqual } from "crypto";
import { SITE_URL } from "@/lib/site-url";

export type UnsubscribeScope = "friend";

function unsubscribeSecret(): string | null {
  return (
    process.env.NOTIFICATION_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.SYNC_CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

function sign(userId: string, scope: UnsubscribeScope): string | null {
  const secret = unsubscribeSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${userId}:${scope}`).digest("base64url");
}

export function buildUnsubscribeUrl(userId: string, scope: UnsubscribeScope = "friend"): string | null {
  const sig = sign(userId, scope);
  if (!sig) return null;
  const token = `${userId}.${sig}`;
  return `${SITE_URL}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}&scope=${scope}`;
}

export function verifyUnsubscribeToken(
  token: string,
  scope: UnsubscribeScope = "friend",
): { ok: true; userId: string } | { ok: false } {
  const [userId, sig] = token.split(".");
  if (!userId || !sig || !/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false };
  const expected = sign(userId, scope);
  if (!expected) return { ok: false };
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
    return { ok: true, userId };
  } catch {
    return { ok: false };
  }
}
