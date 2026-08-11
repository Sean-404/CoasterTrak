"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import type { Coaster, Park } from "@/types/domain";
import { CoasterActions } from "@/components/coaster-actions";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import {
  normalizeCoasterDedupKey,
  preferCoasterForDedup,
} from "@/lib/coaster-dedup";
import { cleanCoasterName, matchesSearchQuery } from "@/lib/display";
import { normalizeLifecycleStatus, isParkDefunct } from "@/lib/coaster-status";
import { compareCoastersOperatingFirst } from "@/lib/catalog-coaster-sort";
import { reconcileCountryWithCoords } from "@/lib/geo-country";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { coasterSlug, parkSlug } from "@/lib/slug";
import { type Units } from "@/lib/units";
import { CoasterStatPills } from "@/components/coaster-stat-pills";
import { ParkStatusBadge } from "@/components/park-status-badge";

type Props = {
  park: Park;
  coasters: Coaster[];
  units?: Units;
  selectedCoasterId?: number | null;
  onCoasterSelect?: (coasterId: number) => void;
  onClose?: () => void;
};

type PreviewState = {
  imageUrl: string;
  name: string;
};

/**
 * Fixed park ride browser — does not move with the map.
 * Mobile: bottom sheet. Desktop: centered overlay panel.
 */
export function MapParkRideSheet({
  park,
  coasters,
  units = "imperial",
  selectedCoasterId = null,
  onCoasterSelect,
  onClose,
}: Props) {
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const canPortal = typeof window !== "undefined";

  useEffect(() => {
    setFilter("");
  }, [park.id]);

  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (preview) {
        setPreview(null);
        return;
      }
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, preview]);

  const rideGroups = useMemo(() => {
    const byKey = new Map<string, Coaster[]>();
    const keyByName = new Map<string, string>();
    for (const coaster of coasters) {
      const nameKey = normalizeCoasterDedupKey(coaster.name);
      const wdKeyRaw = coaster.wikidata_id?.trim().toUpperCase();
      const wdKey = wdKeyRaw ? `wd:${wdKeyRaw}` : null;
      const existingByWd = wdKey ? byKey.get(wdKey) : undefined;
      const existingNameGroupKey = keyByName.get(nameKey);
      const groupKey = existingByWd
        ? (wdKey as string)
        : existingNameGroupKey ?? wdKey ?? `name:${nameKey}`;
      const arr = byKey.get(groupKey) ?? [];
      arr.push(coaster);
      byKey.set(groupKey, arr);
      keyByName.set(nameKey, groupKey);
    }
    return Array.from(byKey.values())
      .map((members) => {
        let primary = members[0];
        for (const c of members.slice(1)) {
          primary = preferCoasterForDedup(primary, c);
        }
        if (!primary.image_url) {
          const withImage = members.find((c) => Boolean(c.image_url));
          if (withImage?.image_url) primary = { ...primary, image_url: withImage.image_url };
        }
        return { members, primary };
      })
      .sort((a, b) => compareCoastersOperatingFirst(a.primary, b.primary));
  }, [coasters]);

  const visible = filter.trim()
    ? rideGroups.filter((g) => g.members.some((c) => matchesSearchQuery(c.name, filter)))
    : rideGroups;

  const country = reconcileCountryWithCoords(
    park.country,
    park.latitude ?? null,
    park.longitude ?? null,
  );
  const parkIsDefunct = isParkDefunct(coasters);

  const panel = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-park-sheet-title"
      className="pointer-events-auto flex max-h-[min(85vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(80vh,640px)] sm:rounded-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <h2 id="map-park-sheet-title" className="truncate text-base font-bold text-slate-900 sm:text-lg">
            {park.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {country ? <p className="text-xs text-slate-500">{country}</p> : null}
            {parkIsDefunct ? <ParkStatusBadge /> : null}
          </div>
          <Link
            href={`/parks/${parkSlug(park.name, park.id)}`}
            className="mt-1 inline-block text-xs font-semibold text-amber-700 hover:underline"
          >
            Park page →
          </Link>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close park rides"
            className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Close
          </button>
        ) : null}
      </div>

      {rideGroups.length > 5 ? (
        <div className="shrink-0 px-4 pt-3 sm:px-5">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter rides…"
            aria-label="Filter rides"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No matching rides</p>
        ) : null}
        {visible.map(({ members, primary: coaster }) => {
          const lifecycle = normalizeLifecycleStatus(coaster.status, {
            closingYear: coaster.closing_year,
          });
          const isDefunct = lifecycle === "Defunct";
          const isSelected =
            selectedCoasterId != null && members.some((member) => member.id === selectedCoasterId);
          const title = cleanCoasterName(coaster.name);
          const rideType = effectiveCoasterType(coaster.coaster_type, coaster.manufacturer ?? null);

          return (
            <div
              key={coaster.id}
              className={`border-b border-slate-100 py-3 last:border-0 ${
                isSelected ? "rounded-lg bg-amber-50 px-2" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <CoasterThumbnail
                  name={title}
                  imageUrl={coaster.image_url}
                  sizeClassName="h-12 w-12"
                  onPreview={(payload) => {
                    flushSync(() => setPreview(payload));
                  }}
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onCoasterSelect?.(coaster.id)}
                    className="text-left text-sm font-semibold text-slate-900 hover:underline"
                  >
                    {title}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {rideType !== "Unknown" ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {rideType}
                      </span>
                    ) : null}
                    {coaster.manufacturer ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {coaster.manufacturer}
                      </span>
                    ) : null}
                    {isDefunct ? (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        Defunct{coaster.closing_year ? ` · ${coaster.closing_year}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <CoasterStatPills coaster={coaster} units={units} />
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/coasters/${coasterSlug(coaster.name, coaster.id)}`}
                      className="inline-flex h-7 items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
                    >
                      Details
                    </Link>
                    <CoasterActions
                      coasterId={coaster.id}
                      disableWishlist={isDefunct}
                      variant="inline"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!canPortal) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[4000] flex items-end justify-center bg-slate-900/35 p-0 sm:items-center sm:p-6"
        onClick={() => onClose?.()}
      >
        {panel}
      </div>
      {preview
        ? createPortal(
            <div
              className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/80 p-4"
              role="dialog"
              aria-modal="true"
              onClick={(event) => {
                if (event.target === event.currentTarget) setPreview(null);
              }}
            >
              <button
                type="button"
                className="absolute right-4 top-4 min-h-10 min-w-10 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-white"
                onClick={() => setPreview(null)}
              >
                Close
              </button>
              <img
                src={preview.imageUrl}
                alt={preview.name}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
                referrerPolicy="no-referrer"
                onClick={(event) => event.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}
    </>,
    document.body,
  );
}
