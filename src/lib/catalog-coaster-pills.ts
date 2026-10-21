import type { Coaster } from "@/types/domain";
import { coasterStatusDisplay } from "@/lib/coaster-status";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import type { CatalogStatPill } from "@/components/catalog-stat-pills";
import { fmtDuration, fmtHeight, fmtLength, fmtSpeed, type Units } from "@/lib/units";

export function buildCoasterMetaPills(
  coaster: Pick<
    Coaster,
    "coaster_type" | "manufacturer" | "status" | "closing_year" | "opening_year"
  >,
): CatalogStatPill[] {
  const pills: CatalogStatPill[] = [];
  const rideType = effectiveCoasterType(coaster.coaster_type, coaster.manufacturer ?? null);
  const status = coasterStatusDisplay(coaster);

  if (rideType !== "Unknown") {
    pills.push({ label: "Type", value: rideType });
  }
  if (coaster.manufacturer) {
    pills.push({ label: "Manufacturer", value: coaster.manufacturer });
  }
  pills.push({ label: "Status", value: status.label, tone: status.tone });
  if (coaster.opening_year) {
    pills.push({ label: "Opened", value: String(coaster.opening_year) });
  }
  return pills;
}

export function buildCoasterMeasurementPills(
  coaster: Pick<
    Coaster,
    "height_ft" | "length_ft" | "speed_mph" | "inversions" | "duration_s"
  >,
  units: Units = "imperial",
): CatalogStatPill[] {
  const pills: CatalogStatPill[] = [];
  const height = fmtHeight(coaster.height_ft, units);
  const length = fmtLength(coaster.length_ft, units);
  const speed = fmtSpeed(coaster.speed_mph, units);
  const duration = fmtDuration(coaster.duration_s);

  if (height) pills.push({ label: "Height", value: height });
  if (speed) pills.push({ label: "Speed", value: speed });
  if (length) pills.push({ label: "Length", value: length });
  if (coaster.inversions != null) {
    pills.push({ label: "Inversions", value: String(coaster.inversions) });
  }
  if (duration) pills.push({ label: "Duration", value: duration });
  return pills;
}
