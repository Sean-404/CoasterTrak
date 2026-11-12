/**
 * Member park reviews: shared rules for the form, API routes and park pages.
 * Pure functions only, so client components can use them too.
 */

/** Enough to say something useful about a park day; also what AdSense counts as original. */
export const REVIEW_MIN_WORDS = 50;
/** Matches the database check on park_reviews.body. */
export const REVIEW_MIN_CHARS = 200;
export const REVIEW_MAX_CHARS = 4000;
export const REVIEW_REPORT_REASON_MAX_CHARS = 300;
/** New or edited reviews per member per rolling 24 hours. */
export const REVIEW_DAILY_LIMIT = 5;
/** A park page with this many approved reviews counts as having original content. */
export const PARK_REVIEWS_INDEX_MIN = 3;
export const REVIEW_EARLIEST_VISIT_YEAR = 1950;

export type ParkReviewStatus = "pending" | "approved" | "hidden";

export type ParkReviewInput = {
  rating: number | null;
  body: string;
  visitedYear: number | null;
};

export type ParkReviewValidation = { ok: true; value: ParkReviewInput } | { ok: false; error: string };

/** What a park page shows for an approved review. No user ids. */
export type PublicParkReview = {
  id: number;
  authorName: string;
  rating: number | null;
  body: string;
  visitedYear: number | null;
  publishedAt: string;
};

/** The signed-in member's own review, in any status. */
export type OwnParkReview = ParkReviewInput & {
  id: number;
  status: ParkReviewStatus;
  updatedAt: string;
};

export const REVIEW_AUTHOR_FALLBACK = "CoasterTrak member";

/** Trim, normalise line endings and spaces, and keep at most one blank line between paragraphs. */
export function normalizeReviewBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function reviewWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function reviewParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const LINK_PATTERN =
  // TLDs that are rarely ordinary words, so "fun.Shop" after a missed space is not flagged.
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|uk|info|biz|xyz|ru)\b/i;

/** Reviews carry no links: they are the usual spam payload and the page already links its sources. */
export function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text);
}

// Same words the display-name check rejects; moderators catch the rest before anything is public.
const BLOCKED_WORDS = [
  "asshole",
  "bastard",
  "bitch",
  "cunt",
  "fuck",
  "motherfucker",
  "pussy",
  "rapist",
  "shit",
  "slut",
  "whore",
];
const BLOCKED_WORD_PATTERN = new RegExp(`\\b(?:${BLOCKED_WORDS.join("|")})(?:s|ing|ed|er)?\\b`, "i");

export function containsBlockedWord(text: string): boolean {
  return BLOCKED_WORD_PATTERN.test(text);
}

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) ? n : undefined;
}

/** Validate a review submission from the form or API body. */
export function validateParkReview(input: unknown, now: Date = new Date()): ParkReviewValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "Review is missing." };
  const raw = input as Record<string, unknown>;

  if (typeof raw.body !== "string") return { ok: false, error: "Write your review first." };
  const body = normalizeReviewBody(raw.body);
  const words = reviewWordCount(body);
  if (words < REVIEW_MIN_WORDS || body.length < REVIEW_MIN_CHARS) {
    return {
      ok: false,
      error: `Reviews need at least ${REVIEW_MIN_WORDS} words. Yours has ${words}.`,
    };
  }
  if (body.length > REVIEW_MAX_CHARS) {
    return { ok: false, error: `Reviews can be up to ${REVIEW_MAX_CHARS.toLocaleString("en-GB")} characters.` };
  }
  if (containsLink(body)) {
    return { ok: false, error: "Please leave links and web addresses out of your review." };
  }
  if (containsBlockedWord(body)) {
    return { ok: false, error: "Please keep your review free of swearing and insults." };
  }

  const rating = parseOptionalInt(raw.rating);
  if (rating === undefined || (rating !== null && (rating < 1 || rating > 5))) {
    return { ok: false, error: "Pick a rating from 1 to 5 stars, or leave it blank." };
  }

  const visitedYear = parseOptionalInt(raw.visitedYear);
  const latestYear = now.getUTCFullYear();
  if (
    visitedYear === undefined ||
    (visitedYear !== null && (visitedYear < REVIEW_EARLIEST_VISIT_YEAR || visitedYear > latestYear))
  ) {
    return { ok: false, error: `Visit year must be between ${REVIEW_EARLIEST_VISIT_YEAR} and ${latestYear}.` };
  }

  return { ok: true, value: { rating, body, visitedYear } };
}

/** Optional reason a member gives when reporting a review. */
export function normalizeReportReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, REVIEW_REPORT_REASON_MAX_CHARS) : null;
}

export function reviewAuthorName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : REVIEW_AUTHOR_FALLBACK;
}

export function isParkReviewStatus(value: unknown): value is ParkReviewStatus {
  return value === "pending" || value === "approved" || value === "hidden";
}
