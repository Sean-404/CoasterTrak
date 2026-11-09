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
  /** Display names of active friends (those that have one), sorted; may be shorter than friendsActive. */
  friendNames?: string[];
  communityRiders: number;
};

const MAX_NAMED_FRIENDS = 3;

/**
 * "Alex logged rides too", "Alex and Sam logged rides too", "Alex, Sam, Jo and 2 more…".
 * Friends without a display name are counted in "more"; with no names it falls back to a count.
 */
export function describeActiveFriends(friendsActive: number, friendNames: string[] = []): string {
  const shown = friendNames.slice(0, Math.min(MAX_NAMED_FRIENDS, friendsActive));
  if (shown.length === 0) {
    return `${friendsActive} friend${friendsActive === 1 ? "" : "s"} logged rides too`;
  }
  const more = friendsActive - shown.length;
  const parts = more > 0 ? [...shown, `${more} more`] : shown;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list} logged rides too`;
}

export type WeeklyDigestPeriod = {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  /** ISO timestamps bounding when rides were logged: [startsAt, endsBefore). */
  startsAt: string;
  endsBefore: string;
  label: string;
};

/**
 * The seven full UTC days before `asOf`. The cron runs Monday morning, so this is the
 * previous Monday–Sunday, including rides logged late on Sunday after a park day.
 */
export function weeklyDigestPeriod(asOf: Date = new Date()): WeeklyDigestPeriod {
  const endExclusive = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  );
  const end = new Date(endExclusive);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(endExclusive);
  start.setUTCDate(start.getUTCDate() - 7);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const label = `${formatShortUtc(start)} – ${formatShortUtc(end)}`;
  return {
    startDate,
    endDate,
    startsAt: start.toISOString(),
    endsBefore: endExclusive.toISOString(),
    label,
  };
}

function formatShortUtc(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

/** True when the recipient or an accepted friend logged rides in the window. */
export function shouldSendWeeklyDigest(stats: WeeklyDigestStats): boolean {
  return stats.newCredits > 0 || stats.totalRides > 0 || stats.friendsActive > 0;
}

export function buildWeeklyDigestEmail(opts: {
  recipientUserId: string;
  displayName: string | null;
  period: Pick<WeeklyDigestPeriod, "startDate" | "endDate" | "label">;
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
      `${stats.parksVisited} park${stats.parksVisited === 1 ? "" : "s"} in this week's logs`,
    );
  }
  if (stats.friendsActive > 0) {
    bullets.push(describeActiveFriends(stats.friendsActive, stats.friendNames));
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

/**
 * Stats for rides *logged* in the window (by created_at), whatever date they were ridden.
 * Many riders backfill past credits without a date, or log a trip a few days late; counting
 * by ridden_on skipped them entirely. A "new credit" is a coaster first added this week.
 */
export async function loadWeeklyDigestStats(
  supabase: SupabaseClient,
  userId: string,
  period: WeeklyDigestPeriod,
  friendIds: string[],
): Promise<WeeklyDigestStats> {
  const [{ data: eventRows }, { data: communityRows }] = await Promise.all([
    supabase
      .from("ride_events")
      .select("coaster_id, quantity")
      .eq("user_id", userId)
      .gte("created_at", period.startsAt)
      .lt("created_at", period.endsBefore),
    supabase
      .from("ride_events")
      .select("user_id")
      .gte("created_at", period.startsAt)
      .lt("created_at", period.endsBefore)
      .limit(5000),
  ]);

  const totalRides = (eventRows ?? []).reduce(
    (sum, row) => sum + Math.max(1, Number(row.quantity) || 1),
    0,
  );

  let newCredits = 0;
  let parksVisited = 0;
  const coasterIds = [...new Set((eventRows ?? []).map((r) => r.coaster_id as number))];
  if (coasterIds.length > 0) {
    const [{ data: earlier }, { data: coasters }] = await Promise.all([
      supabase
        .from("ride_events")
        .select("coaster_id")
        .eq("user_id", userId)
        .lt("created_at", period.startsAt)
        .in("coaster_id", coasterIds),
      supabase.from("coasters").select("park_id").in("id", coasterIds),
    ]);
    const alreadyLogged = new Set((earlier ?? []).map((r) => r.coaster_id as number));
    newCredits = coasterIds.filter((id) => !alreadyLogged.has(id)).length;
    parksVisited = new Set((coasters ?? []).map((c) => c.park_id).filter(Boolean)).size;
  }

  let friendsActive = 0;
  let friendNames: string[] = [];
  if (friendIds.length > 0) {
    const { data: friendEvents } = await supabase
      .from("ride_events")
      .select("user_id")
      .in("user_id", friendIds)
      .gte("created_at", period.startsAt)
      .lt("created_at", period.endsBefore);
    const activeFriendIds = [...new Set((friendEvents ?? []).map((r) => r.user_id as string))];
    friendsActive = activeFriendIds.length;
    if (activeFriendIds.length > 0) {
      const { data: friendProfiles } = await supabase
        .from("profiles")
        .select("display_name, banned_at")
        .in("user_id", activeFriendIds);
      friendNames = (friendProfiles ?? [])
        .filter((p) => !p.banned_at)
        .map((p) => (p.display_name as string | null)?.trim() ?? "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    }
  }

  const communityRiders = new Set((communityRows ?? []).map((r) => r.user_id as string)).size;

  return { newCredits, totalRides, parksVisited, friendsActive, friendNames, communityRiders };
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
