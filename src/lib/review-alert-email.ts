import { CONTACT_EMAIL, siteHref } from "@/lib/site-url";

/** Where moderation alerts go: REVIEW_ALERT_EMAIL if set, otherwise the contact address. */
export function reviewAlertRecipient(): string {
  return process.env.REVIEW_ALERT_EMAIL?.trim() || CONTACT_EMAIL;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ReviewAlertInput = {
  parkName: string;
  authorName: string;
  rating: number | null;
  body: string;
  /** True when the member edited a review that was already published or declined. */
  isEdit: boolean;
};

/** A plain moderation alert for the admin: who, which park, the text, and a link to the queue. */
export function buildReviewAlertEmail(input: ReviewAlertInput): { subject: string; text: string; html: string } {
  const queueUrl = siteHref("/admin/reviews");
  const verb = input.isEdit ? "edited their review of" : "reviewed";
  const subject = `Review to check: ${input.authorName} ${verb} ${input.parkName}`;
  const ratingLine = input.rating != null ? `${input.rating}/5 stars` : "No rating";

  const text = [
    `${input.authorName} ${verb} ${input.parkName}. ${ratingLine}.`,
    "",
    input.body,
    "",
    `Approve or hide it: ${queueUrl}`,
  ].join("\n");

  const paragraphs = input.body
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p.trim()).replace(/\n/g, "<br />")}</p>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b45309">Review to check</p>
      <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(input.authorName)} ${verb} ${escapeHtml(input.parkName)}</h1>
      <p style="margin:0 0 16px;color:#475569">${escapeHtml(ratingLine)}</p>
      <div style="font-size:15px;line-height:1.55;color:#334155">${paragraphs}</div>
      <p style="margin:20px 0 0">
        <a href="${queueUrl}" style="display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;text-decoration:none;padding:10px 16px;border-radius:8px">Open the review queue</a>
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
