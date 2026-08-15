"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import { useUnits } from "@/components/providers";
import { RideHistoryEditor } from "@/components/ride-history-editor";
import { StarRating } from "@/components/star-rating";
import { cleanCoasterName, formatParkLabel } from "@/lib/display";
import {
  formatRideCount,
  formatRideOnDate,
  localDateISO,
  MAX_RIDES_PER_EVENT,
  type RideCreditSummary,
} from "@/lib/ride-history";
import { fmtDuration, fmtHeight, fmtLength, fmtSpeed } from "@/lib/units";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  RIDE_PHOTO_ACCEPT,
  removeRidePhoto,
  uploadRidePhoto,
} from "@/lib/ride-photos";

export type RiddenRideSheetRide = {
  coaster_id: number;
  rating: number | null;
  ridden_at?: string | null;
  total_rides?: number;
  first_ridden_on?: string | null;
  last_ridden_on?: string | null;
  photo_path?: string | null;
  photoUrl?: string | null;
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
  loggingRide?: boolean;
  onClose: () => void;
  onRate: (coasterId: number, rating: number | null) => void;
  onRemove: (coasterId: number, name: string) => void;
  onAddRide?: (
    coasterId: number,
    quantity: number,
    riddenOn: string,
  ) => Promise<{ ok: true } | { ok: false; message: string } | void> | void;
  onHistoryChanged?: (summary: RideCreditSummary | null) => void;
  ownerUserId?: string | null;
  onPhotoChange?: (
    coasterId: number,
    next: { photoPath: string | null; photoUrl: string | null },
  ) => void;
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
  loggingRide = false,
  onClose,
  onRate,
  onRemove,
  onAddRide,
  onHistoryChanged,
  ownerUserId,
  onPhotoChange,
}: RiddenRideSheetProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const { units } = useUnits();
  const [quantity, setQuantity] = useState(1);
  const [rideDate, setRideDate] = useState(() => localDateISO());
  const [logError, setLogError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const busy = savingRating || removing || loggingRide || historyBusy || photoBusy;

  useEffect(() => {
    if (!open) return;
    setQuantity(1);
    setRideDate(localDateISO());
    setLogError("");
    setPhotoError("");
  }, [open, ride?.coaster_id]);

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
  const totalRides = ride.total_rides ?? 1;
  const firstRiddenLabel = formatRideOnDate(ride.first_ridden_on);
  const lastRiddenLabel = formatRideOnDate(ride.last_ridden_on);
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
              imageUrl={ride.photoUrl || ride.coasters?.image_url}
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
          <div className="mb-4 rounded-xl bg-green-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-green-700/80">
              {canEdit ? "You've ridden this" : "Rides logged"}
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-green-900">
              {formatRideCount(totalRides)}
            </p>
            {(firstRiddenLabel || lastRiddenLabel || riddenLabel) && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-green-900/80">
                {firstRiddenLabel ? (
                  <div>
                    <dt className="font-medium text-green-700/80">First ridden</dt>
                    <dd className="mt-0.5 tabular-nums">{firstRiddenLabel}</dd>
                  </div>
                ) : null}
                {lastRiddenLabel ? (
                  <div>
                    <dt className="font-medium text-green-700/80">Last ridden</dt>
                    <dd className="mt-0.5 tabular-nums">{lastRiddenLabel}</dd>
                  </div>
                ) : null}
                {!firstRiddenLabel && !lastRiddenLabel && riddenLabel ? (
                  <div className="col-span-2">
                    <dt className="font-medium text-green-700/80">Logged</dt>
                    <dd className="mt-0.5 tabular-nums">{riddenLabel}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </div>

          {(canEdit || ride.photoUrl) && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-800">Ride photo</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {canEdit
                  ? "One photo per ride. JPEG, PNG, or WebP. People who can view your stats can see it."
                  : "Uploaded by this rider."}
              </p>
              {ride.photoUrl ? (
                <div className="mt-3">
                  <CoasterThumbnail
                    name={coasterName}
                    imageUrl={ride.photoUrl}
                    sizeClassName="h-44 w-full"
                    showMissingLabel
                  />
                </div>
              ) : null}
              {photoError ? (
                <p className="mt-2 text-xs font-medium text-red-500">{photoError}</p>
              ) : null}
              {canEdit && ownerUserId && onPhotoChange ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept={RIDE_PHOTO_ACCEPT}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      void (async () => {
                        const supabase = getSupabaseBrowserClient();
                        if (!supabase) return;
                        setPhotoError("");
                        setPhotoBusy(true);
                        const result = await uploadRidePhoto(supabase, ownerUserId, ride.coaster_id, file);
                        setPhotoBusy(false);
                        if (!result.ok) {
                          setPhotoError(result.message);
                          return;
                        }
                        onPhotoChange(ride.coaster_id, {
                          photoPath: result.photoPath,
                          photoUrl: result.photoUrl || null,
                        });
                      })();
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => photoInputRef.current?.click()}
                    className="min-h-11 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
                  >
                    {photoBusy ? "Saving…" : ride.photoUrl ? "Replace photo" : "Add photo"}
                  </button>
                  {ride.photoUrl ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void (async () => {
                          const supabase = getSupabaseBrowserClient();
                          if (!supabase) return;
                          setPhotoError("");
                          setPhotoBusy(true);
                          const result = await removeRidePhoto(
                            supabase,
                            ownerUserId,
                            ride.coaster_id,
                            ride.photo_path,
                          );
                          setPhotoBusy(false);
                          if (!result.ok) {
                            setPhotoError(result.message);
                            return;
                          }
                          onPhotoChange(ride.coaster_id, { photoPath: null, photoUrl: null });
                        })();
                      }}
                      className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Remove photo
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {canEdit && onHistoryChanged ? (
            <RideHistoryEditor
              coasterId={ride.coaster_id}
              refreshKey={`${totalRides}-${ride.last_ridden_on ?? ""}`}
              disabled={busy}
              className="mb-4"
              onBusyChange={setHistoryBusy}
              onChanged={onHistoryChanged}
            />
          ) : null}

          {stats.length > 0 ? (
            <div className="mb-4 grid grid-cols-2 gap-2">
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

          {canEdit && onAddRide && (
            <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-800">Log another ride</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Adds to your total, even if you already rode this on another day.
              </p>
              {logError ? (
                <p className="mt-2 text-xs font-medium text-red-500">{logError}</p>
              ) : null}
              <label className="mt-3 block">
                <span className="text-xs font-medium text-slate-600">Ride date</span>
                <input
                  type="date"
                  value={rideDate}
                  max={localDateISO()}
                  min="1950-01-01"
                  onChange={(event) => {
                    setLogError("");
                    setRideDate(event.target.value || localDateISO());
                  }}
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </label>
              <div className="mt-2 flex items-stretch gap-2">
                <div className="inline-flex h-11 shrink-0 items-center rounded-lg border border-slate-200 bg-white">
                  <button
                    type="button"
                    aria-label="Fewer rides"
                    disabled={busy || quantity <= 1}
                    onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                    className="flex h-11 w-11 items-center justify-center text-lg font-semibold text-slate-700 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center text-base font-semibold tabular-nums text-slate-900">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="More rides"
                    disabled={busy || quantity >= MAX_RIDES_PER_EVENT}
                    onClick={() => setQuantity((n) => Math.min(MAX_RIDES_PER_EVENT, n + 1))}
                    className="flex h-11 w-11 items-center justify-center text-lg font-semibold text-slate-700 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setLogError("");
                      const result = await onAddRide(ride.coaster_id, quantity, rideDate);
                      if (result && result.ok === false) setLogError(result.message);
                    })();
                  }}
                  className="h-11 min-w-0 flex-1 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {loggingRide ? "Saving…" : quantity === 1 ? "Add ride" : `Add ${quantity} rides`}
                </button>
              </div>
            </div>
          )}

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
                {removing ? "Removing…" : totalRides > 1 ? "Remove all rides" : "Remove ride"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
