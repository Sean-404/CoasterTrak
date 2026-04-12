export type Units = "imperial" | "metric";

export function fmtLength(ft: number | null | undefined, units: Units): string | null {
  if (ft == null) return null;
  if (units === "metric") return `${Math.round(ft * 0.3048).toLocaleString()} m`;
  return `${ft.toLocaleString()} ft`;
}

export function fmtHeight(ft: number | null | undefined, units: Units): string | null {
  if (ft == null) return null;
  if (units === "metric") return `${Math.round(ft * 0.3048)} m`;
  return `${ft} ft`;
}

export function fmtSpeed(mph: number | null | undefined, units: Units): string | null {
  if (mph == null) return null;
  if (units === "metric") return `${Math.round(mph * 1.60934)} km/h`;
  return `${mph} mph`;
}
