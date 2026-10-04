import { SITE_URL, siteHref } from "@/lib/site-url";
import { buildUnsubscribeUrl } from "@/lib/unsubscribe-token";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFriendRequestEmail(opts: {
  recipientUserId: string;
  actorDisplayName: string;
}) {
  const name = opts.actorDisplayName.trim() || "Someone";
  const friendsUrl = siteHref("/friends", SITE_URL);
  const accountUrl = siteHref("/account", SITE_URL);
  const unsubUrl = buildUnsubscribeUrl(opts.recipientUserId, "friend");
  const subject = `${name} sent you a friend request on CoasterTrak`;
  const text = [
    `${name} sent you a friend request on CoasterTrak.`,
    "",
    `Open Friends: ${friendsUrl}`,
    "",
    `Manage email preferences: ${accountUrl}`,
    unsubUrl ? `Unsubscribe from friend emails: ${unsubUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#0f172a">
      <p style="margin:0 0 12px"><strong>${escapeHtml(name)}</strong> sent you a friend request on CoasterTrak.</p>
      <p style="margin:0 0 16px">
        <a href="${friendsUrl}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:600;padding:10px 14px;border-radius:8px">
          View request
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:#64748b">
        <a href="${accountUrl}" style="color:#64748b">Manage email preferences</a>
        ${unsubUrl ? ` · <a href="${unsubUrl}" style="color:#64748b">Unsubscribe from friend emails</a>` : ""}
      </p>
    </div>
  `.trim();

  return { subject, text, html };
}

export function buildFriendAcceptedEmail(opts: {
  recipientUserId: string;
  actorDisplayName: string;
}) {
  const name = opts.actorDisplayName.trim() || "Someone";
  const friendsUrl = siteHref("/friends", SITE_URL);
  const accountUrl = siteHref("/account", SITE_URL);
  const unsubUrl = buildUnsubscribeUrl(opts.recipientUserId, "friend");
  const subject = `${name} accepted your friend request on CoasterTrak`;
  const text = [
    `${name} accepted your friend request on CoasterTrak.`,
    "",
    `Open Friends: ${friendsUrl}`,
    "",
    `Manage email preferences: ${accountUrl}`,
    unsubUrl ? `Unsubscribe from friend emails: ${unsubUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#0f172a">
      <p style="margin:0 0 12px"><strong>${escapeHtml(name)}</strong> accepted your friend request on CoasterTrak.</p>
      <p style="margin:0 0 16px">
        <a href="${friendsUrl}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:600;padding:10px 14px;border-radius:8px">
          Open Friends
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:#64748b">
        <a href="${accountUrl}" style="color:#64748b">Manage email preferences</a>
        ${unsubUrl ? ` · <a href="${unsubUrl}" style="color:#64748b">Unsubscribe from friend emails</a>` : ""}
      </p>
    </div>
  `.trim();

  return { subject, text, html };
}
