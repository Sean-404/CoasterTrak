"use client";

import { useState } from "react";
import { REVIEW_REPORT_REASON_MAX_CHARS } from "@/lib/park-reviews";
import { authedJson, getAccessToken } from "@/lib/park-reviews-client";

type ReportState = "idle" | "open" | "sending" | "sent" | "error";

/** Lets a signed-in member flag a published review for a moderator. */
export function ReportReviewButton({ reviewId }: { reviewId: number }) {
  const [state, setState] = useState<ReportState>("idle");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const open = async () => {
    if (!(await getAccessToken())) {
      setState("error");
      setMessage("Sign in to report a review.");
      return;
    }
    setState("open");
    setMessage(null);
  };

  const send = async () => {
    setState("sending");
    try {
      await authedJson<{ ok: true }>(`/api/park-reviews/${reviewId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setState("sent");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not send the report.");
    }
  };

  if (state === "sent") {
    return <p className="text-xs text-slate-500">Thanks, a moderator will take a look.</p>;
  }

  if (state === "open" || state === "sending") {
    return (
      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="text-xs text-slate-600">What&apos;s wrong with this review? (optional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REVIEW_REPORT_REASON_MAX_CHARS}
            disabled={state === "sending"}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={send}
            disabled={state === "sending"}
            className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            {state === "sending" ? "Sending…" : "Send report"}
          </button>
          <button
            type="button"
            onClick={() => setState("idle")}
            disabled={state === "sending"}
            className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={open} className="text-xs text-slate-500 underline-offset-2 hover:underline">
        Report
      </button>
      {state === "error" && message ? <span className="text-xs text-rose-700">{message}</span> : null}
    </span>
  );
}
