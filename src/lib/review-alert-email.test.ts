import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReviewAlertEmail, reviewAlertRecipient } from "@/lib/review-alert-email";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildReviewAlertEmail", () => {
  it("names the member, park and rating, and links to the queue", () => {
    const email = buildReviewAlertEmail({
      parkName: "Alton Towers",
      authorName: "Coaster Fan",
      rating: 4,
      body: "Great day.\n\nThe Smiler queue was short.",
      isEdit: false,
    });
    expect(email.subject).toBe("Review to check: Coaster Fan reviewed Alton Towers");
    expect(email.text).toContain("4/5 stars");
    expect(email.text).toContain("/admin/reviews");
    expect(email.html).toContain("<p style=\"margin:0 0 12px\">The Smiler queue was short.</p>");
  });

  it("says when a review was edited and escapes HTML in member text", () => {
    const email = buildReviewAlertEmail({
      parkName: "Thorpe Park",
      authorName: "<b>Sneaky</b>",
      rating: null,
      body: "<script>alert(1)</script>",
      isEdit: true,
    });
    expect(email.subject).toContain("edited their review of Thorpe Park");
    expect(email.text).toContain("No rating");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;b&gt;Sneaky&lt;/b&gt;");
  });
});

describe("reviewAlertRecipient", () => {
  it("uses REVIEW_ALERT_EMAIL when set, otherwise the contact address", () => {
    vi.stubEnv("REVIEW_ALERT_EMAIL", "");
    expect(reviewAlertRecipient()).toBe("hello@coastertrak.com");
    vi.stubEnv("REVIEW_ALERT_EMAIL", "mod@example.com");
    expect(reviewAlertRecipient()).toBe("mod@example.com");
  });
});
