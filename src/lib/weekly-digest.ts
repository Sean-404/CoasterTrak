import type { SupabaseClient } from "@supabase/supabase-js";
import { emailShell, escapeHtml } from "@/lib/friend-notify";
import { sendTransactionalEmail } from "@/lib/transactional-email";
import { SITE_URL, siteHref } from "@/lib/site-url";
import { buildUnsubscribeUrl } from "@/lib/unsubscribe-token";

const FONT_BODY = "Arial, Helvetica, sans-serif";

export type WeeklyDigestStats = {
  newCredits: number;
  totalRides: number;
  parksVisited: number;
  friendsActive: number;
  communityRiders: number;
};

export type WeeklyDigestPeriod = {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  label: string;
};

/** Rolling last-7-days window ending on `asOf` (local UTC calendar). */
export function weeklyDigestPeriod(asOf: Date = new Date()): WeeklyDigestPeriod {
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const label = `${formatShortUtc(start)} – ${formatShortUtc(end)}`;
  return { startDate, endDate, label };
}

function formatShortUtc(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

/** True when the recipient or an accepted friend logged dated rides in the window. */
export function shouldSendWeeklyDigest(stats: WeeklyDigestStats): boolean {
  return stats.newCredits > 0 || stats.totalRides > 0 || stats.friendsActive > 0;
}

export function buildWeeklyDigestEmail(opts: {
  recipientUserId: string;
  displayName: string | null;
  period: WeeklyDigestPeriod;
  stats: WeeklyDigestStats;
}) {
  const firstName = opts.displayName?.trim() || "there";
  const statsUrl = siteHref("/stats", SITE_URL);
  const accountUrl = siteHref("/account", SITE_URL);
  const unsubUrl = buildUnsubscribeUrl(opts.recipientUserId, "digest");
  const { stats, period } = opts;

  const bullets: string[] = [];
  if (stats.newCredits > 0) {
    bullets.push(
      `${stats.newCredits} new coaster credit${stats.newCredits === 1 ? "" : "s"}`,
    );
  }
  if (stats.totalRides > 0) {
    bullets.push(`${stats.totalRides} total ride${stats.totalRides === 1 ? "" : "s"} logged`);
  }
  if (stats.parksVisited > 0) {
    bullets.push(
      `${stats.parksVisited} park${stats.parksVisited === 1 ? "" : "s"} in your dated rides`,
    );
  }
  if (stats.friendsActive > 0) {
    bullets.push(
      `${stats.friendsActive} friend${stats.friendsActive === 1 ? "" : "s"} logged rides too`,
    );
  }

  const communityLine =
    stats.communityRiders > 1
      ? `${stats.communityRiders} riders logged credits on CoasterTrak this week.`
      : null;

  const subject =
    stats.newCredits > 0
      ? `Your week on CoasterTrak: ${stats.newCredits} new credit${stats.newCredits === 1 ? "" : "s"}`
      : stats.totalRides > 0
        ? `Your week on CoasterTrak: ${stats.totalRides} ride${stats.totalRides === 1 ? "" : "s"}`
        : "Your week on CoasterTrak";

  const text = [
    `Hi ${firstName},`,
    "",
    `Here's your CoasterTrak summary for ${period.label}:`,
    ...bullets.map((b) => `- ${b}`),
    communityLine,
    "",
    `Open Stats: ${statsUrl}`,
    "",
    `Manage email preferences: ${accountUrl}`,
    unsubUrl ? `Unsubscribe from weekly digests: ${unsubUrl}` : "",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  const listHtml = bullets
    .map(
      (b) =>
        `<li class="email-muted" style="margin:0 0 6px;font-size:15px;color:#334155;font-family:${FONT_BODY};">${escapeHtml(b)}</li>`,
    )
    .join("");

  const communityHtml = communityLine
    ? `<p class="email-muted" style="margin:14px 0 0;font-size:14px;color:#64748b;font-family:${FONT_BODY};">${escapeHtml(communityLine)}</p>`
    : "";

  const html = emailShell({
    preheader: `Your CoasterTrak week · ${period.label}`,
    heading: "Your week on CoasterTrak",
    bodyHtml: `
      <p class="email-muted" style="margin:0 0 12px;font-size:15px;color:#334155;font-family:${FONT_BODY};">
        Hi <strong class="email-text" style="color:#0f172a">${escapeHtml(firstName)}</strong> — here’s your summary for
        <strong class="email-text" style="color:#0f172a">${escapeHtml(period.label)}</strong>.
      </p>
      <ul style="margin:0;padding-left:20px;">${listHtml}</ul>
      ${communityHtml}
      <p class="email-muted" style="margin:14px 0 0;font-size:13px;color:#64748b;font-family:${FONT_BODY};">
        Digests only go out when you or a friend logged rides that week. Turn them off anytime in Account.
      </p>
    `,
    ctaLabel: "Open Stats",
    ctaUrl: statsUrl,
    accountUrl,
    unsubUrl,
    unsubLabel: "Unsubscribe from weekly digests",
  });

  return { subject, text, html };
}

export async function loadWeeklyDigestStats(
  supabase: SupabaseClient,
  userId: string,
  period: WeeklyDigestPeriod,
  friendIds: string[],
): Promise<WeeklyDigestStats> {
  const [{ data: creditRows }, { data: eventRows }, { data: communityRows }] = await Promise.all([
    supabase
      .from("ride_credit_summaries")
      .select("coaster_id")
      .eq("user_id", userId)
      .gte("first_ridden_on", period.startDate)
      .lte("first_ridden_on", period.endDate),
    supabase
      .from("ride_events")
      .select("coaster_id, quantity")
      .eq("user_id", userId)
      .gte("ridden_on", period.startDate)
      .lte("ridden_on", period.endDate),
    supabase
      .from("ride_events")
      .select("user_id")
      .gte("ridden_on", period.startDate)
      .lte("ridden_on", period.endDate)
      .limit(5000),
  ]);

  const totalRides = (eventRows ?? []).reduce(
    (sum, row) => sum + Math.max(1, Number(row.quantity) || 1),
    0,
  );

  let parksVisited = 0;
  const coasterIds = [...new Set((eventRows ?? []).map((r) => r.coaster_id as number))];
  if (coasterIds.length > 0) {
    const { data: coasters } = await supabase.from("coasters").select("park_id").in("id", coasterIds);
    parksVisited = new Set((coasters ?? []).map((c) => c.park_id).filter(Boolean)).size;
  }

  let friendsActive = 0;
  if (friendIds.length > 0) {
    const { data: friendEvents } = await supabase
      .from("ride_events")
      .select("user_id")
      .in("user_id", friendIds)
      .gte("ridden_on", period.startDate)
      .lte("ridden_on", period.endDate);
    friendsActive = new Set((friendEvents ?? []).map((r) => r.user_id as string)).size;
  }

  const communityRiders = new Set((communityRows ?? []).map((r) => r.user_id as string)).size;

  return {
    newCredits: creditRows?.length ?? 0,
    totalRides,
    parksVisited,
    friendsActive,
    communityRiders,
  };
}

async function acceptedFriendIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return (data ?? [])
    .map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id) as string)
    .filter((id) => id && id !== userId);
}

/**
 * Send weekly digests to opted-in users who have something to say.
 * Uses service-role client. Soft-fails per recipient.
 */
export async function sendWeeklyDigests(supabase: SupabaseClient, asOf: Date = new Date()) {
  const period = weeklyDigestPeriod(asOf);
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .eq("notify_weekly_digest", true)
    .is("banned_at", null);

  if (error) {
    throw new Error(error.message);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles ?? []) {
    const userId = profile.user_id as string;
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    const email = authData?.user?.email?.trim();
    if (authError || !email) {
      skipped += 1;
      continue;
    }

    const friendIds = await acceptedFriendIds(supabase, userId);
    const stats = await loadWeeklyDigestStats(supabase, userId, period, friendIds);
    if (!shouldSendWeeklyDigest(stats)) {
      skipped += 1;
      continue;
    }

    const emailPayload = buildWeeklyDigestEmail({
      recipientUserId: userId,
      displayName: (profile.display_name as string | null) ?? null,
      period,
      stats,
    });

    const result = await sendTransactionalEmail({
      to: email,
      subject: emailPayload.subject,
      text: emailPayload.text,
      html: emailPayload.html,
    });

    if (result.ok) sent += 1;
    else if (result.skipped) skipped += 1;
    else {
      failed += 1;
      console.error("Weekly digest send failed", userId, result.error);
    }
  }

  return { period, recipients: profiles?.length ?? 0, sent, skipped, failed };
}
