"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppPageHeading } from "@/components/app-page-heading";
import { SiteHeader } from "@/components/site-header";
import { StarRating } from "@/components/star-rating";
import type { AdminParkReview } from "@/app/api/admin/park-reviews/route";
import { isAdminUser } from "@/lib/admin";
import { reviewParagraphs, reviewWordCount } from "@/lib/park-reviews";
import { authedJson } from "@/lib/park-reviews-client";
import { getSupabaseUserSafe } from "@/lib/supabase";

type Filter = "pending" | "reported" | "approved" | "hidden";
type Counts = Record<Filter, number>;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "pending", label: "Waiting" },
  { key: "reported", label: "Reported" },
  { key: "approved", label: "Approved" },
  { key: "hidden", label: "Hidden" },
];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminReviewsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [reviews, setReviews] = useState<AdminParkReview[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (next: Filter) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await authedJson<{ reviews: AdminParkReview[]; counts: Counts }>(
        `/api/admin/park-reviews?filter=${next}`,
      );
      setReviews(payload.reviews);
      setCounts(payload.counts);
    } catch (err) {
      setReviews([]);
      setError(err instanceof Error ? err.message : "Could not load reviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getSupabaseUserSafe().then((user) => {
      if (cancelled) return;
      const isAdmin = isAdminUser(user);
      setAllowed(isAdmin);
      if (isAdmin) void load(filter);
    });
    return () => {
      cancelled = true;
    };
  }, [filter, load]);

  const act = async (id: number, action: "approve" | "hide" | "clear-reports") => {
    setBusyId(id);
    setError(null);
    try {
      await authedJson<{ ok: true }>(`/api/admin/park-reviews/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the review.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <AppPageHeading>Park reviews</AppPageHeading>
            <p className="mt-1 text-sm text-slate-500">
              Approve reviews that describe a real visit and follow the guidelines. Hide spam, ads, abuse,
              copied text, or anything about people rather than the park.
            </p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-amber-700 hover:underline">
            ← Admin
          </Link>
        </div>

        {allowed === null ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : !allowed ? (
          <p className="mt-8 text-sm text-slate-600">Admin access required.</p>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Review status">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    filter === key
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {label}
                  {counts ? ` (${counts[key]})` : ""}
                </button>
              ))}
            </div>

            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
            {loading ? <p className="mt-6 text-sm text-slate-500">Loading…</p> : null}
            {!loading && !error && reviews.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">Nothing here.</p>
            ) : null}

            <ul className="mt-6 space-y-4">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {review.parkHref ? (
                      <Link href={review.parkHref} className="font-semibold text-amber-700 hover:underline">
                        {review.parkName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-900">{review.parkName}</span>
                    )}
                    <span className="text-slate-400">·</span>
                    <Link href={`/admin/users/${review.userId}`} className="text-slate-700 hover:underline">
                      {review.authorName}
                    </Link>
                    {review.authorBanned ? (
                      <span className="rounded bg-rose-100 px-1.5 text-xs font-semibold text-rose-700">banned</span>
                    ) : null}
                    {review.rating != null ? <StarRating value={review.rating} size="sm" /> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {review.status} · updated {formatWhen(review.updatedAt)} · {reviewWordCount(review.body)} words
                    {review.visitedYear ? ` · visited ${review.visitedYear}` : ""}
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
                    {reviewParagraphs(review.body).map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </div>
                  {review.openReports.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                      <p className="font-semibold">
                        {review.openReports.length} open report{review.openReports.length === 1 ? "" : "s"}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {review.openReports.map((report, i) => (
                          <li key={i}>{report.reason || "No reason given"}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {review.status !== "approved" ? (
                      <button
                        type="button"
                        disabled={busyId === review.id}
                        onClick={() => void act(review.id, "approve")}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                      >
                        Approve
                      </button>
                    ) : null}
                    {review.status !== "hidden" ? (
                      <button
                        type="button"
                        disabled={busyId === review.id}
                        onClick={() => void act(review.id, "hide")}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 disabled:opacity-60"
                      >
                        Hide
                      </button>
                    ) : null}
                    {review.openReports.length > 0 ? (
                      <button
                        type="button"
                        disabled={busyId === review.id}
                        onClick={() => void act(review.id, "clear-reports")}
                        className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        Dismiss reports
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
