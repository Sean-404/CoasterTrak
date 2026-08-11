"use client";

import type { Coaster } from "@/types/domain";
import { fmtDuration, fmtHeight, fmtLength, fmtSpeed, type Units } from "@/lib/units";

type StatPill = {
  label: string;
  value: string;
};

export function buildCoasterStatPills(
  coaster: Pick<
    Coaster,
    "height_ft" | "length_ft" | "speed_mph" | "inversions" | "duration_s"
  >,
  units: Units = "imperial",
): StatPill[] {
  const pills: StatPill[] = [];
  const height = fmtHeight(coaster.height_ft, units);
  const length = fmtLength(coaster.length_ft, units);
  const speed = fmtSpeed(coaster.speed_mph, units);
  const duration = fmtDuration(coaster.duration_s);

  if (height) pills.push({ label: "Height", value: height });
  if (speed) pills.push({ label: "Speed", value: speed });
  if (length) pills.push({ label: "Length", value: length });
  if (coaster.inversions != null) {
    pills.push({
      label: "Inversions",
      value: String(coaster.inversions),
    });
  }
  if (duration) pills.push({ label: "Duration", value: duration });
  return pills;
}

export function CoasterStatPills({
  coaster,
  units = "imperial",
  className = "",
}: {
  coaster: Pick<
    Coaster,
    "height_ft" | "length_ft" | "speed_mph" | "inversions" | "duration_s"
  >;
  units?: Units;
  className?: string;
}) {
  const pills = buildCoasterStatPills(coaster, units);
  if (pills.length === 0) return null;

  return (
    <div className={`mt-1.5 flex flex-wrap gap-1.5 ${className}`.trim()}>
      {pills.map((pill) => (
        <span
          key={pill.label}
          className="inline-flex items-baseline gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] leading-tight text-slate-700"
        >
          <span className="font-medium text-slate-400">{pill.label}</span>
          <span className="font-semibold text-slate-800">{pill.value}</span>
        </span>
      ))}
    </div>
  );
}
