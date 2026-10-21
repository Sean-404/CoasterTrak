"use client";

import Link from "next/link";
import { CoasterActions } from "@/components/coaster-actions";
import { CoasterStatPills } from "@/components/coaster-stat-pills";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import { cleanCoasterName, formatManufacturerLabel } from "@/lib/display";
import { coasterStatusDisplay } from "@/lib/coaster-status";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { coasterSlug } from "@/lib/slug";
import type { Coaster } from "@/types/domain";

const STATUS_PILL_CLASS = {
  green: "bg-green-50 text-green-700",
  red: "bg-red-100 text-red-700",
  slate: "bg-slate-100 text-slate-500",
} as const;

export function ParkCoasterRow({
  coaster,
  parkName,
  parkCountry,
  nofollow = false,
}: {
  coaster: Coaster;
  parkName?: string | null;
  parkCountry?: string | null;
  nofollow?: boolean;
}) {
  const cName = cleanCoasterName(coaster.name);
  const status = coasterStatusDisplay(coaster);
  const isDefunct = status.lifecycle === "Defunct";
  const rideType = effectiveCoasterType(coaster.coaster_type, coaster.manufacturer ?? null);
  const manufacturer = formatManufacturerLabel(coaster.manufacturer, {
    parkName,
    country: parkCountry,
  });
  const linkRel = nofollow ? "nofollow" : undefined;

  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        <CoasterThumbnail
          name={cName}
          imageUrl={coaster.image_url}
          sizeClassName="h-14 w-14 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/coasters/${coasterSlug(coaster.name, coaster.id)}`}
            rel={linkRel}
            className="text-base font-semibold text-slate-900 hover:text-amber-800 hover:underline"
          >
            {cName}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {rideType !== "Unknown" ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {rideType}
              </span>
            ) : null}
            {manufacturer ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {manufacturer}
              </span>
            ) : null}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL_CLASS[status.tone]}`}>
              {status.label}
            </span>
          </div>
          <CoasterStatPills coaster={coaster} className="mt-2" />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Link
              href={`/coasters/${coasterSlug(coaster.name, coaster.id)}`}
              rel={linkRel}
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
    </li>
  );
}
