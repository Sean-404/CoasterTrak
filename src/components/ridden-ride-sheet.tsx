"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import { useUnits } from "@/components/providers";
import { StarRating } from "@/components/star-rating";
import { cleanCoasterName, formatParkLabel } from "@/lib/display";
import { fmtDuration, fmtHeight, fmtLength, fmtSpeed } from "@/lib/units";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";

export type RiddenRideSheetRide = {
  coaster_id: number;
  rating: number | null;
  ridden_at?: string | null;
  coasters?: {
    park_id?: number;
    name: string;
    image_url?: string | null;
    coaster_type: string;
    manufacturer: string | null;
    length_ft?: number | null;
    speed_mph?: number | null;
    height_ft?: number | null;
    inversions?: number | null;
    duration_s?: number | null;
    parks?: { name: string; country: string } | null;
  } | null;
};

type RiddenRideSheetProps = {
  ride: RiddenRideSheetRide | null;
  open: boolean;
  canEdit: boolean;
  savingRating: boolean;
  removing: boolean;
  onClose: () => void;
  onRate: (coasterId: number, rating: number | null) => void;
  onRemove: (coasterId: number, name: string) => void;
};

function formatRiddenDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function RiddenRideSheet({
  ride,
  open,
  canEdit,
  savingRating,
  removing,
  onClose,
  onRate,
  onRemove,
}: RiddenRideSheetProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { units } = useUnits();
  const busy = savingRating || removing;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    // Focus close control after paint for keyboard/mobile a11y.
    const raf = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(raf);
    };
  }, [open, onClose]);

  if (!open || !ride || typeof document === "undefined") return null;

  const coasterName = cleanCoasterName(ride.coasters?.name ?? `Coaster ${ride.coaster_id}`);
  const parkLine = formatParkLabel(
    ride.coasters?.parks?.name,
    ride.coasters?.parks?.country,
  );
  const typeLabel = effectiveCoasterType(
    ride.coasters?.coaster_type,
    ride.coasters?.manufacturer,
  );
  const mapHref =
    ride.coasters?.park_id != null
      ? `/map?coaster=${ride.coaster_id}&park=${ride.coasters.park_id}&view=map`
      : `/map?coaster=${ride.coaster_id}&view=map`;
  const riddenLabel = formatRiddenDate(ride.ridden_at);
  const c = ride.coasters;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Height", value: fmtHeight(c?.height_ft, units) ?? "" },
    { label: "Speed", value: fmtSpeed(c?.speed_mph, units) ?? "" },
    { label: "Length", value: fmtLength(c?.length_ft, units) ?? "" },
    {
      label: "Inversions",
      value: c?.inversions != null ? String(c.inversions) : "",
    },
    { label: "Duration", value: fmtDuration(c?.duration_s) ?? "" },
  ].filter((row) => row.value);

  return createPortal(
    <div className="fixed inset-0 z-[5000] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close ride details"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <CoasterThumbnail
              name={coasterName}
              imageUrl={ride.coasters?.image_url}
              sizeClassName="h-14 w-14"
              showMissingLabel
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                {coasterName}
              </h2>
              <p className="mt-0.5 text-sm leading-snug text-slate-500 break-words">
                {parkLine && <span>{parkLine}</span>}
                {parkLine && <span> · </span>}
                <span>{typeLabel}</span>
                {ride.coasters?.manufacturer && (
                  <span> · {ride.coasters.manufacturer}</span>
                )}
              </p>
              {riddenLabel && (
                <p className="mt-1 text-xs text-slate-400">Logged {riddenLabel}</p>
              )}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 shrink-0"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {stats.length > 0 ? (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-xl bg-slate-50 px-4 py-4">
            <p className="text-sm font-medium text-slate-800">
              {canEdit ? "Your rating" : "Rating"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {canEdit
                ? "Tap a star to rate. Tap the same star again to clear."
                : ride.rating != null
                  ? `${ride.rating} out of 5`
                  : "Not rated yet"}
            </p>
            <div className="mt-3">
              <StarRating
                value={ride.rating}
                editable={canEdit}
                size="lg"
                disabled={busy}
                label={`Rate ${coasterName}`}
                onChange={(next) => onRate(ride.coaster_id, next)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href={mapHref}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              onClick={onClose}
            >
              View on map
            </Link>
            {canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(ride.coaster_id, coasterName)}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove ride"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
