"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ALL_TIME_WRAPPED_PERIOD,
  formatWrappedPeriodLabel,
  listWrappedPeriodOptions,
  topRideReasonLabel,
  type MonthWrappedSummary,
} from "@/lib/month-wrapped";

type Props = {
  period: string;
  onPeriodChange: (period: string) => void;
  summary: MonthWrappedSummary | null;
  loading: boolean;
  error: string | null;
  isOwnStats: boolean;
  /** True when the user has any credits (dated or not) — empty calendar periods can point here. */
  hasAnyCredits?: boolean;
};

export function MonthWrappedCard({
  period,
  onPeriodChange,
  summary,
  loading,
  error,
  isOwnStats,
  hasAnyCredits = false,
}: Props) {
  const periodOptions = useMemo(() => listWrappedPeriodOptions(18, 4), []);
  const scope =
    summary?.scope ??
    (period === ALL_TIME_WRAPPED_PERIOD ? "all" : period.length === 4 ? "year" : "month");
  const label = summary?.label ?? formatWrappedPeriodLabel(period);
  const parksHeading =
    scope === "all" ? "Parks" : scope === "year" ? "Parks this year" : "Parks this month";
  const quietTitle =
    scope === "all" ? "No credits yet" : scope === "year" ? "Quiet year" : "Quiet month";

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            {scope === "all" ? "All-time Wrapped" : scope === "year" ? "Year Wrapped" : "Month Wrapped"}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">{label}</h2>
        </div>
        <label className="text-sm text-slate-600">
          <span className="sr-only">Period</span>
          <select
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.scope === "all"
                  ? "All-time · every credit"
                  : option.scope === "year"
                    ? `${option.label} · full year`
                    : option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading {scope === "all" ? "all-time" : scope}…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !summary || summary.empty ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-5">
          <p className="text-base font-semibold text-slate-900">{quietTitle}</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            {scope === "all" ? (
              isOwnStats ? (
                <>Mark a ride as ridden to start your all-time Wrapped. No date needed.</>
              ) : (
                <>No credits logged yet.</>
              )
            ) : isOwnStats ? (
              <>
                No dated rides in {label}. Month and year Wrapped only count credits logged with a
                date — your undated credits still show in All-time.
              </>
            ) : (
              <>No dated rides logged in {label}.</>
            )}
          </p>
          {isOwnStats ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {scope !== "all" && hasAnyCredits ? (
                <button
                  type="button"
                  onClick={() => onPeriodChange(ALL_TIME_WRAPPED_PERIOD)}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
                >
                  Open All-time Wrapped
                </button>
              ) : (
                <Link
                  href="/map"
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
                >
                  Browse map
                </Link>
              )}
              <Link
                href="/wishlist"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-400"
              >
                Open wishlist
              </Link>
            </div>
          ) : scope !== "all" && hasAnyCredits ? (
            <button
              type="button"
              onClick={() => onPeriodChange(ALL_TIME_WRAPPED_PERIOD)}
              className="mt-4 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
            >
              Open All-time Wrapped
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div
            className={`grid grid-cols-2 gap-2 ${scope === "all" ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}
          >
            <StatChip label="Credits" value={String(summary.uniqueCredits)} />
            <StatChip label="Rides" value={String(summary.totalRides)} />
            <StatChip label="Parks" value={String(summary.uniqueParks)} />
            {scope !== "all" ? (
              <StatChip label="Active days" value={String(summary.activeDays)} />
            ) : null}
          </div>

          <HighlightCard
            eyebrow="Top ride"
            title={summary.topRide?.name ?? "—"}
            subtitle={
              summary.topRide
                ? [
                    summary.topRide.parkLabel,
                    topRideReasonLabel(summary.topRide.reason, summary.scope),
                    summary.topRide.rating != null ? `${summary.topRide.rating}★` : null,
                    summary.topRide.ridesInPeriod > 1
                      ? `${summary.topRide.ridesInPeriod} rides`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null
            }
          />

          {summary.parks.length > 0 ? (
            <div className="rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                {parksHeading}
              </p>
              <ul className="mt-2 max-h-[min(40vh,16rem)] divide-y divide-slate-100 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                {summary.parks.map((park, index) => (
                  <li
                    key={park.parkId}
                    className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {index === 0 ? (
                          <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                            Top
                          </span>
                        ) : null}
                        {park.name}
                      </p>
                      {park.country ? (
                        <p className="truncate text-xs text-slate-500">{park.country}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs font-medium text-slate-600">
                      {park.creditsInPeriod} credit{park.creditsInPeriod === 1 ? "" : "s"}
                      {" · "}
                      {park.ridesInPeriod} ride{park.ridesInPeriod === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {(summary.tallestRide || summary.fastestRide) && (
            <div className="flex flex-wrap gap-2 text-sm text-slate-600">
              {summary.tallestRide ? (
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
                  Tallest logged:{" "}
                  <strong className="font-semibold text-slate-900">{summary.tallestRide.name}</strong>
                  {" · "}
                  {Math.round(summary.tallestRide.heightFt)} ft
                </span>
              ) : null}
              {summary.fastestRide ? (
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
                  Fastest logged:{" "}
                  <strong className="font-semibold text-slate-900">{summary.fastestRide.name}</strong>
                  {" · "}
                  {Math.round(summary.fastestRide.speedMph)} mph
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function HighlightCard({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string | null;
}) {
  return (
    <div className="rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{eyebrow}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{title}</p>
      {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
    </div>
  );
}
