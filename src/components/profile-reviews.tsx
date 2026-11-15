import Link from "next/link";
import { StarRating } from "@/components/star-rating";
import { reviewParagraphs, type ProfileParkReview } from "@/lib/park-reviews";

const EXCERPT_CHARS = 280;

const STATUS_BADGE: Record<ProfileParkReview["status"], { label: string; tone: string } | null> = {
  approved: null,
  pending: { label: "Waiting for a moderator", tone: "bg-amber-100 text-amber-800" },
  hidden: { label: "Not published", tone: "bg-slate-200 text-slate-700" },
};

function excerpt(body: string): string {
  const text = reviewParagraphs(body).join(" ");
  if (text.length <= EXCERPT_CHARS) return text;
  const cut = text.slice(0, EXCERPT_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

function formatMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

type Props = {
  reviews: ProfileParkReview[];
  /** "Your park reviews" on your own stats, "Park reviews" elsewhere. */
  heading?: string;
  /** Shown when there are no reviews; omit to render nothing. */
  emptyText?: string;
};

/** A member's park reviews on their profile or stats page, each linking to the park. */
export function ProfileReviews({ reviews, heading = "Park reviews", emptyText }: Props) {
  if (reviews.length === 0 && !emptyText) return null;
  return (
    <section aria-labelledby="profile-reviews-heading" className="mt-8">
      <h2 id="profile-reviews-heading" className="text-lg font-semibold text-slate-900">
        {heading}
        {reviews.length > 0 ? <span className="ml-1.5 text-sm font-normal text-slate-500">({reviews.length})</span> : null}
      </h2>
      {reviews.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {reviews.map((review) => {
            const badge = STATUS_BADGE[review.status];
            return (
              <li key={review.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {review.parkHref ? (
                    <Link href={review.parkHref} className="font-semibold text-amber-700 underline-offset-2 hover:underline">
                      {review.parkName}
                    </Link>
                  ) : (
                    <span className="font-semibold text-slate-900">{review.parkName}</span>
                  )}
                  {review.rating != null ? <StarRating value={review.rating} size="sm" label="Rating" /> : null}
                  {badge ? (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${badge.tone}`}>{badge.label}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {review.visitedYear ? `Visited ${review.visitedYear} · ` : ""}
                  {formatMonth(review.publishedAt)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{excerpt(review.body)}</p>
                {review.parkHref && review.status === "approved" ? (
                  <Link
                    href={`${review.parkHref}#park-reviews-heading`}
                    className="mt-2 inline-block text-xs font-semibold text-amber-700 underline-offset-2 hover:underline"
                  >
                    Read on the park page
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
