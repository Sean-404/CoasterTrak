import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/site-url";
import { verifyUnsubscribeToken, type UnsubscribeScope } from "@/lib/unsubscribe-token";

function parseScope(value: string | null): UnsubscribeScope {
  return value === "digest" ? "digest" : "friend";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const scope = parseScope(url.searchParams.get("scope"));
  const verified = verifyUnsubscribeToken(token, scope);

  if (!verified.ok) {
    return NextResponse.redirect(
      `${SITE_URL}/notifications/unsubscribed?error=invalid`,
      { status: 303 },
    );
  }

  const service = getSupabaseServerClient();
  if (!service) {
    return NextResponse.redirect(
      `${SITE_URL}/notifications/unsubscribed?error=config`,
      { status: 303 },
    );
  }

  const patch =
    scope === "digest"
      ? { notify_weekly_digest: false }
      : {
          notify_friend_requests: false,
          notify_friend_accepted: false,
        };

  const { error } = await service.from("profiles").update(patch).eq("user_id", verified.userId);

  if (error) {
    return NextResponse.redirect(
      `${SITE_URL}/notifications/unsubscribed?error=save`,
      { status: 303 },
    );
  }

  return NextResponse.redirect(
    `${SITE_URL}/notifications/unsubscribed?ok=1&scope=${scope}`,
    { status: 303 },
  );
}
