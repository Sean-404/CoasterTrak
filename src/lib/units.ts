/** imperial = ft + mph | mixed-ft = ft + km/h | mixed-m = m + mph | metric = m + km/h */
export type Units = "imperial" | "mixed-ft" | "mixed-m" | "metric";

export const UNITS_CYCLE: Units[] = ["imperial", "mixed-ft", "mixed-m", "metric"];

export const UNITS_LABEL: Record<Units, string> = {
  imperial: "ft / mph",
  "mixed-ft": "ft / km/h",
  "mixed-m": "m / mph",
  metric: "m / km/h",
};

const useMetres = (units: Units) => units === "metric" || units === "mixed-m";
const useMph = (units: Units) => units === "imperial" || units === "mixed-m";

export function fmtLength(ft: number | null | undefined, units: Units): string | null {
  if (ft == null) return null;
  if (useMetres(units)) return `${Math.round(ft * 0.3048).toLocaleString()} m`;
  return `${ft.toLocaleString()} ft`;
}

export function fmtHeight(ft: number | null | undefined, units: Units): string | null {
  if (ft == null) return null;
  if (useMetres(units)) return `${Math.round(ft * 0.3048)} m`;
  return `${ft} ft`;
}

export function fmtSpeed(mph: number | null | undefined, units: Units): string | null {
  if (mph == null) return null;
  if (useMph(units)) return `${mph} mph`;
  return `${Math.round(mph * 1.60934)} km/h`;
}

/** Format ride duration (track time) from seconds — not unit-dependent. */
export function fmtDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
