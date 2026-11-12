import { ParkReviewForm } from "@/components/park-review-form";
import { ReportReviewButton } from "@/components/report-review-button";
import { StarRating } from "@/components/star-rating";
import { reviewParagraphs, type PublicParkReview } from "@/lib/park-reviews";

type Props = {
  parkId: number;
  parkName: string;
  parkPath: string;
  reviews: PublicParkReview[];
};

function formatPublished(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Approved member reviews of a park, plus the form to write your own. */
export function ParkReviews({ parkId, parkName, parkPath, reviews }: Props) {
  const rated = reviews.filter((r) => r.rating != null);
  const average = rated.length > 0 ? rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length : null;

  return (
    <section aria-labelledby="park-reviews-heading" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="park-reviews-heading" className="text-xl font-semibold text-slate-900">
          Member reviews
        </h2>
        {/* StarRating renders a <div>, so this wrapper cannot be a <p>. */}
        {average != null ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <StarRating value={Math.round(average)} size="sm" label="Average member rating" />
            <span>
              {average.toFixed(1)} from {rated.length} rating{rated.length === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Written by CoasterTrak members about their own visits, and checked by a moderator before they appear.
      </p>

      <ParkReviewForm parkId={parkId} parkName={parkName} parkPath={parkPath} />

      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No reviews of {parkName} yet. Be the first to write one.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {reviews.map((review) => (
            <li key={review.id}>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-semibold text-slate-900">{review.authorName}</p>
                  {review.rating != null ? <StarRating value={review.rating} size="sm" label="Rating" /> : null}
                  <p className="text-xs text-slate-500">
                    {review.visitedYear ? `Visited ${review.visitedYear} · ` : ""}
                    {formatPublished(review.publishedAt)}
                  </p>
                </header>
                <div className="mt-3 space-y-3 text-base leading-relaxed text-slate-700">
                  {reviewParagraphs(review.body).map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
                <footer className="mt-3">
                  <ReportReviewButton reviewId={review.id} />
                </footer>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
