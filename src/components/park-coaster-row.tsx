"use client";

import Link from "next/link";
import { CoasterActions } from "@/components/coaster-actions";
import { CoasterStatPills } from "@/components/coaster-stat-pills";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import { cleanCoasterName } from "@/lib/display";
import { normalizeLifecycleStatus } from "@/lib/coaster-status";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { coasterSlug } from "@/lib/slug";
import type { Coaster } from "@/types/domain";

export function ParkCoasterRow({ coaster }: { coaster: Coaster }) {
  const cName = cleanCoasterName(coaster.name);
  const isDefunct =
    normalizeLifecycleStatus(coaster.status, { closingYear: coaster.closing_year }) === "Defunct";
  const rideType = effectiveCoasterType(coaster.coaster_type, coaster.manufacturer ?? null);

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
            {coaster.manufacturer ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {coaster.manufacturer}
              </span>
            ) : null}
            {isDefunct ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                Defunct{coaster.closing_year ? ` · ${coaster.closing_year}` : ""}
              </span>
            ) : coaster.status ? (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                {coaster.status}
              </span>
            ) : null}
          </div>
          <CoasterStatPills coaster={coaster} className="mt-2" />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
    </li>
  );
}
