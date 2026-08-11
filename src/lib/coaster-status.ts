type LifecycleStatus = "Operating" | "Defunct" | "Unknown";

export type CoasterLifecycleFields = {
  status: string;
  closing_year?: number | null;
};

/**
 * Normalize mixed legacy status values into lifecycle-only status.
 * We do not model live queue state (open/closed today) anymore.
 */
export function normalizeLifecycleStatus(
  rawStatus: string | null | undefined,
  opts?: { closingYear?: number | null },
): LifecycleStatus {
  const s = (rawStatus ?? "").trim().toLowerCase();
  if (!s) return "Unknown";

  if (
    s === "defunct" ||
    s.includes("removed") ||
    s.includes("demol") ||
    s.includes("sbno") ||
    s.includes("standing but not operating") ||
    s.includes("permanently closed") ||
    s.includes("scrap")
  ) {
    return "Defunct";
  }

  if (
    s === "operating" ||
    s === "open" ||
    s.includes("reopened") ||
    s.includes("operat") ||
    s.includes("relocated") ||
    s.includes("moved")
  ) {
    return "Operating";
  }

  if (s === "closed") {
    return opts?.closingYear != null ? "Defunct" : "Unknown";
  }

  if (s === "unknown" || s === "n/a" || s === "na") return "Unknown";
  return "Unknown";
}

export function isCoasterDefunct(coaster: CoasterLifecycleFields): boolean {
  return (
    normalizeLifecycleStatus(coaster.status, { closingYear: coaster.closing_year }) === "Defunct"
  );
}

/** When every catalog coaster at a park is defunct, treat the park as defunct too. */
export function isParkDefunct(coasters: CoasterLifecycleFields[]): boolean {
  return coasters.length > 0 && coasters.every(isCoasterDefunct);
}

export function inferParkLifecycleStatus(coasters: CoasterLifecycleFields[]): LifecycleStatus {
  if (isParkDefunct(coasters)) return "Defunct";
  if (
    coasters.some(
      (coaster) =>
        normalizeLifecycleStatus(coaster.status, { closingYear: coaster.closing_year }) ===
        "Operating",
    )
  ) {
    return "Operating";
  }
  return "Unknown";
}
