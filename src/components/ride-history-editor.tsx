"use client";

import { useEffect, useState } from "react";
import {
  formatRideCount,
  formatRideDayLabel,
  type RideCreditSummary,
  type RideDayLog,
} from "@/lib/ride-history";
import { adjustRideEvents, loadRideEventsForCoaster } from "@/lib/ride-log";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type RideHistoryEditorProps = {
  coasterId: number;
  refreshKey?: string | number;
  disabled?: boolean;
  className?: string;
  onBusyChange?: (busy: boolean) => void;
  onChanged: (summary: RideCreditSummary | null) => void;
};

export function RideHistoryEditor({
  coasterId,
  refreshKey,
  disabled = false,
  className = "",
  onBusyChange,
  onChanged,
}: RideHistoryEditorProps) {
  const [days, setDays] = useState<RideDayLog[]>([]);
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const user = await getSupabaseUserSafe();
      if (!supabase || !user) {
        if (!cancelled) setDays([]);
        return;
      }
      const result = await loadRideEventsForCoaster(supabase, user.id, coasterId);
      if (cancelled) return;
      setDays(result.days);
      setError(result.error ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [coasterId, refreshKey]);

  async function removeFromDay(day: RideDayLog, quantity: number, confirmAll: boolean) {
    if (disabled || busyDay) return;
    const label = formatRideDayLabel(day.riddenOn);
    const remainingTotal = days.reduce((sum, row) => sum + row.quantity, 0);
    const removesCredit = quantity >= remainingTotal;
    if (removesCredit) {
      const ok = window.confirm(
        remainingTotal > 1
          ? `Remove the last ${remainingTotal} rides? This also removes the unique credit.`
          : "Remove this ride and the unique credit?",
      );
      if (!ok) return;
    } else if (confirmAll && day.quantity > 1) {
      const ok = window.confirm(`Remove all ${day.quantity} rides from ${label}?`);
      if (!ok) return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const key = day.riddenOn ?? "none";
    setBusyDay(key);
    onBusyChange?.(true);
    setError("");
    const result = await adjustRideEvents(supabase, {
      coasterId,
      riddenOn: day.riddenOn,
      quantity,
    });
    setBusyDay(null);
    onBusyChange?.(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onChanged(result.summary);
    if (!result.summary) {
      setDays([]);
      return;
    }
    setDays((prev) =>
      prev
        .map((row) =>
          row.id === day.id ? { ...row, quantity: row.quantity - quantity } : row,
        )
        .filter((row) => row.quantity >= 1),
    );
  }

  if (days.length === 0) return null;

  const busy = Boolean(busyDay) || disabled;

  return (
    <div className={`rounded-xl border border-slate-200 bg-white px-4 py-3 ${className}`.trim()}>
      <p className="text-sm font-medium text-slate-800">Logged days</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Remove a count if you logged the wrong day or too many rides.
      </p>
      {error ? <p className="mt-2 text-xs font-medium text-red-500">{error}</p> : null}
      <ul className="mt-2 divide-y divide-slate-100">
        {days.map((day) => {
          const key = day.riddenOn ?? "none";
          const dayBusy = busyDay === key;
          return (
            <li key={day.id} className="flex items-center gap-2 py-2 first:pt-1 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{formatRideDayLabel(day.riddenOn)}</p>
                <p className="text-xs tabular-nums text-slate-500">
                  {day.riddenOn ? formatRideCount(day.quantity) : `${formatRideCount(day.quantity)} · original credit`}
                </p>
              </div>
              {day.quantity > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove one ride on ${formatRideDayLabel(day.riddenOn)}`}
                  disabled={busy}
                  onClick={() => void removeFromDay(day, 1, false)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 text-lg font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  {dayBusy ? "…" : "−"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeFromDay(day, day.quantity, true)}
                className="min-h-11 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
              >
                {day.quantity > 1 ? "Remove day" : "Remove"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
