import { describe, expect, it } from "vitest";
import {
  REVIEW_AUTHOR_FALLBACK,
  REVIEW_MAX_CHARS,
  containsBlockedWord,
  containsLink,
  normalizeReportReason,
  normalizeReviewBody,
  reviewAuthorName,
  reviewParagraphs,
  validateParkReview,
} from "@/lib/park-reviews";

const NOW = new Date("2026-11-12T12:00:00Z");

const GOOD_BODY = [
  "We went on a Saturday in late May and the queues were shorter than I expected before lunch.",
  "The big coaster was the highlight: smooth, fast and with a great first drop, so we rode it twice.",
  "",
  "Food was pricey but fine. Go to the back of the park first, then work forwards as it fills up.",
].join("\n");

describe("validateParkReview", () => {
  it("accepts a normal review and normalises whitespace", () => {
    const result = validateParkReview(
      { body: `  ${GOOD_BODY.replace("We went", "We   went")}\n\n\n`, rating: 4, visitedYear: 2025 },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rating).toBe(4);
    expect(result.value.visitedYear).toBe(2025);
    expect(result.value.body.startsWith("We went on")).toBe(true);
    expect(result.value.body.endsWith("fills up.")).toBe(true);
  });

  it("lets rating and visit year be left blank", () => {
    const result = validateParkReview({ body: GOOD_BODY, rating: "", visitedYear: null }, NOW);
    expect(result).toMatchObject({ ok: true, value: { rating: null, visitedYear: null } });
  });

  it("rejects short reviews with the word count", () => {
    const result = validateParkReview({ body: "Great park, loved it, would go again." }, NOW);
    expect(result).toEqual({ ok: false, error: "Reviews need at least 50 words. Yours has 7." });
  });

  it("rejects reviews over the length cap", () => {
    const result = validateParkReview({ body: `${GOOD_BODY} ${"ride ".repeat(REVIEW_MAX_CHARS / 4)}` }, NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects links, swearing, bad ratings and future visit years", () => {
    expect(validateParkReview({ body: `${GOOD_BODY} Tickets at cheap-tix.com` }, NOW).ok).toBe(false);
    expect(validateParkReview({ body: `${GOOD_BODY} The staff were shit.` }, NOW).ok).toBe(false);
    expect(validateParkReview({ body: GOOD_BODY, rating: 6 }, NOW).ok).toBe(false);
    expect(validateParkReview({ body: GOOD_BODY, rating: 3.5 }, NOW).ok).toBe(false);
    expect(validateParkReview({ body: GOOD_BODY, visitedYear: 2027 }, NOW).ok).toBe(false);
    expect(validateParkReview({ body: GOOD_BODY, visitedYear: 1900 }, NOW).ok).toBe(false);
  });

  it("rejects missing input", () => {
    expect(validateParkReview(null, NOW).ok).toBe(false);
    expect(validateParkReview({ rating: 5 }, NOW).ok).toBe(false);
  });
});

describe("containsLink", () => {
  it("catches URLs and bare domains", () => {
    expect(containsLink("see https://example.org")).toBe(true);
    expect(containsLink("www.example")).toBe(true);
    expect(containsLink("book at parktickets.co.uk")).toBe(true);
  });

  it("ignores ordinary sentences, including a missed space after a full stop", () => {
    expect(containsLink("It was fun.Shop prices were high. Ride times were 2.5 hours.")).toBe(false);
  });
});

describe("containsBlockedWord", () => {
  it("matches whole words only", () => {
    expect(containsBlockedWord("What a fucking queue")).toBe(true);
    expect(containsBlockedWord("Scunthorpe has a nice shitake stand")).toBe(false);
  });
});

describe("helpers", () => {
  it("normalises bodies and splits paragraphs", () => {
    expect(normalizeReviewBody("a\r\n\r\n\r\n\r\nb  c ")).toBe("a\n\nb c");
    expect(reviewParagraphs("one\ntwo\n\nthree")).toEqual(["one two", "three"]);
  });

  it("falls back to a generic author name", () => {
    expect(reviewAuthorName("  ")).toBe(REVIEW_AUTHOR_FALLBACK);
    expect(reviewAuthorName("Coaster Fan")).toBe("Coaster Fan");
  });

  it("trims report reasons", () => {
    expect(normalizeReportReason("  spam   spam ")).toBe("spam spam");
    expect(normalizeReportReason("")).toBeNull();
    expect(normalizeReportReason(5)).toBeNull();
    expect(normalizeReportReason("x".repeat(500))?.length).toBe(300);
  });
});
