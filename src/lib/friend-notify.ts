import { SITE_URL, siteHref } from "@/lib/site-url";
import { buildUnsubscribeUrl } from "@/lib/unsubscribe-token";

const LOGO_URL = `${SITE_URL}/coastertrak-logo.png`;

/**
 * Gmail strips webfonts. Keep a Bungee/Geist stack for clients that load
 * Google Fonts (Apple Mail), with Arial Black / Arial fallbacks for Gmail.
 */
const FONT_BRAND = "'Bungee', 'Arial Black', Arial, sans-serif";
const FONT_BODY = "Geist, Arial, Helvetica, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailShell(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  accountUrl: string;
  unsubUrl: string | null;
}): string {
  const unsubHtml = opts.unsubUrl
    ? ` · <a href="${opts.unsubUrl}" style="color:#64748b;text-decoration:underline">Unsubscribe from friend emails</a>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bungee&family=Geist:wght@400;600;700&display=swap" rel="stylesheet" />
    <style type="text/css">
      :root { color-scheme: light only; supported-color-schemes: light only; }
      @media (prefers-color-scheme: dark) {
        .email-bg { background-color: #f8fafc !important; }
        .email-card { background-color: #ffffff !important; }
        .email-header { background-color: #fffbeb !important; }
        .email-text { color: #0f172a !important; }
        .email-muted { color: #334155 !important; }
        .email-brand { color: #b45309 !important; }
        .email-footer { color: #64748b !important; }
      }
    </style>
  </head>
  <body class="email-bg" style="margin:0;padding:0;background-color:#f8fafc;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f8fafc" class="email-bg" style="background-color:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" class="email-card" style="max-width:480px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td align="center" bgcolor="#fffbeb" class="email-header" style="padding:22px 24px 14px;text-align:center;background-color:#fffbeb;">
                <img src="${LOGO_URL}" width="64" height="64" alt="CoasterTrak" style="display:block;margin:0 auto;border:0;border-radius:14px;width:64px;height:64px;" />
                <div class="email-brand" style="margin-top:10px;font-family:${FONT_BRAND};font-size:15px;line-height:1.2;letter-spacing:0.06em;text-transform:uppercase;color:#b45309;">
                  CoasterTrak
                </div>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" class="email-card" style="padding:8px 24px 24px;font-family:${FONT_BODY};color:#0f172a;line-height:1.5;background-color:#ffffff;">
                <h1 class="email-text" style="margin:0 0 12px;font-family:${FONT_BRAND};font-size:24px;line-height:1.2;font-weight:400;color:#0f172a;">
                  ${escapeHtml(opts.heading)}
                </h1>
                ${opts.bodyHtml}
                <p style="margin:20px 0 0;">
                  <a href="${opts.ctaUrl}" style="display:inline-block;background-color:#f59e0b;color:#0f172a;text-decoration:none;font-family:${FONT_BODY};font-weight:700;font-size:15px;padding:12px 16px;border-radius:10px;">
                    ${escapeHtml(opts.ctaLabel)}
                  </a>
                </p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" class="email-footer" style="padding:16px 24px;border-top:1px solid #e2e8f0;font-family:${FONT_BODY};font-size:12px;color:#64748b;background-color:#ffffff;">
                <a href="${opts.accountUrl}" style="color:#64748b;text-decoration:underline">Manage email preferences</a>${unsubHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
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

  const html = emailShell({
    preheader: `${name} sent you a friend request.`,
    heading: "New friend request",
    bodyHtml: `<p class="email-muted" style="margin:0;font-size:15px;color:#334155;font-family:${FONT_BODY};"><strong class="email-text" style="color:#0f172a">${escapeHtml(name)}</strong> wants to be friends on CoasterTrak so you can compare credits and stats.</p>`,
    ctaLabel: "View request",
    ctaUrl: friendsUrl,
    accountUrl,
    unsubUrl,
  });

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

  const html = emailShell({
    preheader: `${name} accepted your friend request.`,
    heading: "Friend request accepted",
    bodyHtml: `<p class="email-muted" style="margin:0;font-size:15px;color:#334155;font-family:${FONT_BODY};"><strong class="email-text" style="color:#0f172a">${escapeHtml(name)}</strong> accepted your friend request. You can now compare credits and stats.</p>`,
    ctaLabel: "Open Friends",
    ctaUrl: friendsUrl,
    accountUrl,
    unsubUrl,
  });

  return { subject, text, html };
}
