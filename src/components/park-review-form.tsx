"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { StarRating } from "@/components/star-rating";
import {
  REVIEW_EARLIEST_VISIT_YEAR,
  REVIEW_MAX_CHARS,
  REVIEW_MIN_WORDS,
  normalizeReviewBody,
  reviewWordCount,
  validateParkReview,
  type OwnParkReview,
} from "@/lib/park-reviews";
import { authedJson } from "@/lib/park-reviews-client";
import { getSupabaseUserSafe } from "@/lib/supabase";

type Props = {
  parkId: number;
  parkName: string;
  parkPath: string;
};

type LoadState = "loading" | "signed-out" | "ready" | "unavailable";

const STATUS_COPY: Record<OwnParkReview["status"], { title: string; body: string; tone: string }> = {
  pending: {
    title: "Your review is waiting for a moderator",
    body: "It will appear here once it has been checked, usually within a few days.",
    tone: "border-amber-200 bg-amber-50",
  },
  approved: {
    title: "Your review is live",
    body: "Thanks for sharing your visit. Editing it sends it back to a moderator.",
    tone: "border-emerald-200 bg-emerald-50",
  },
  hidden: {
    title: "Your review was not published",
    body: "It may have broken the review guidelines. You can edit it and send it again.",
    tone: "border-slate-200 bg-slate-50",
  },
};

function visitYears(): number[] {
  const latest = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = latest; y >= REVIEW_EARLIEST_VISIT_YEAR; y -= 1) years.push(y);
  return years;
}

/** Write, edit or delete your own review of a park. */
export function ParkReviewForm({ parkId, parkName, parkPath }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [review, setReview] = useState<OwnParkReview | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [visitedYear, setVisitedYear] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const years = useMemo(() => visitYears(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await getSupabaseUserSafe();
      if (cancelled) return;
      if (!user) {
        setState("signed-out");
        return;
      }
      try {
        const payload = await authedJson<{ review: OwnParkReview | null }>(`/api/park-reviews?parkId=${parkId}`);
        if (cancelled) return;
        setReview(payload.review);
        setState("ready");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parkId]);

  const startEditing = () => {
    setBody(review?.body ?? "");
    setRating(review?.rating ?? null);
    setVisitedYear(review?.visitedYear ?? null);
    setError(null);
    setEditing(true);
  };

  const words = reviewWordCount(normalizeReviewBody(body));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = { body, rating, visitedYear };
    const check = validateParkReview(input);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await authedJson<{ review: OwnParkReview }>("/api/park-reviews", {
        method: "PUT",
        body: JSON.stringify({ parkId, ...check.value }),
      });
      setReview(payload.review);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete your review of this park? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await authedJson<{ ok: true }>(`/api/park-reviews?parkId=${parkId}`, { method: "DELETE" });
      setReview(null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your review.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading" || state === "unavailable") return null;

  if (state === "signed-out") {
    return (
      <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Been to {parkName}?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(parkPath)}`}
          className="font-semibold text-amber-700 hover:underline"
        >
          Sign in
        </Link>{" "}
        to write a review.
      </p>
    );
  }

  if (!editing) {
    if (!review) {
      return (
        <button
          type="button"
          onClick={startEditing}
          className="mt-4 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
        >
          Write a review of {parkName}
        </button>
      );
    }
    const copy = STATUS_COPY[review.status];
    return (
      <div className={`mt-4 rounded-xl border p-4 ${copy.tone}`}>
        <p className="text-sm font-semibold text-slate-900">{copy.title}</p>
        <p className="mt-1 text-sm text-slate-600">{copy.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startEditing}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
          >
            Edit review
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-900">Your review of {parkName}</p>
        <p className="mt-1 text-sm text-slate-600">
          Write about your own visit: what you rode, queue and timing tips, food, and how the day went. At least{" "}
          {REVIEW_MIN_WORDS} words, no links. A moderator reads every review before it appears.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rating (optional)</p>
          <StarRating value={rating} onChange={setRating} editable size="sm" label="Park rating" disabled={busy} />
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Year visited (optional)</span>
          <select
            value={visitedYear ?? ""}
            onChange={(e) => setVisitedYear(e.target.value ? Number(e.target.value) : null)}
            disabled={busy}
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="">Not saying</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="sr-only">Review</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={REVIEW_MAX_CHARS}
          rows={8}
          disabled={busy}
          placeholder={`How was your day at ${parkName}?`}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-base leading-relaxed text-slate-900 placeholder:text-slate-400"
        />
        <span className={`mt-1 block text-xs ${words >= REVIEW_MIN_WORDS ? "text-emerald-700" : "text-slate-500"}`}>
          {words} / {REVIEW_MIN_WORDS} words minimum
        </span>
      </label>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send for review"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Reviews are shown with your display name. See the{" "}
        <Link href="/terms#reviews" className="underline underline-offset-2">
          review guidelines
        </Link>
        .
      </p>
    </form>
  );
}
