type LifecycleStatus = "Operating" | "Defunct" | "Unknown";

export type CoasterLifecycleFields = {
  status: string;
  closing_year?: number | null;
  opening_year?: number | null;
};

function currentCalendarYear(): number {
  return new Date().getFullYear();
}

/**
 * True when the catalog row has a past closing year that is not superseded by a
 * later reopening / rebuild opening year on the same row.
 */
export function hasPastClosingYear(opts?: {
  closingYear?: number | null;
  openingYear?: number | null;
}): boolean {
  const closingYear = opts?.closingYear ?? null;
  const openingYear = opts?.openingYear ?? null;
  if (closingYear == null || closingYear > currentCalendarYear()) return false;
  if (openingYear != null && openingYear > closingYear) return false;
  return true;
}

/**
 * Normalize mixed legacy status values into lifecycle-only status.
 * We do not model live queue state (open/closed today) anymore.
 *
 * Catalog rows are park installations: "relocated to …" means defunct here
 * (the hardware may still run elsewhere as a different credit).
 */
export function normalizeLifecycleStatus(
  rawStatus: string | null | undefined,
  opts?: { closingYear?: number | null; openingYear?: number | null },
): LifecycleStatus {
  const s = (rawStatus ?? "").trim().toLowerCase();
  if (!s) {
    return hasPastClosingYear(opts) ? "Defunct" : "Unknown";
  }

  if (
    s === "defunct" ||
    s.includes("remov") ||
    s.includes("demol") ||
    s.includes("sbno") ||
    s.includes("standing but not operating") ||
    s.includes("permanently closed") ||
    s.includes("scrap") ||
    s.includes("torn down") ||
    /\brelocated to\b/.test(s) ||
    /\bmoved to\b/.test(s) ||
    (/\brelocated\b/.test(s) && !/\brelocated from\b/.test(s)) ||
    (/\bmoved\b/.test(s) && !/\bmoved from\b/.test(s))
  ) {
    return "Defunct";
  }

  // Past closing date wins over a stale "Operating" label (common Wikidata lag).
  if (hasPastClosingYear(opts)) {
    return "Defunct";
  }

  if (
    s === "operating" ||
    s === "open" ||
    s.includes("reopened") ||
    s.includes("operat") ||
    /\brelocated from\b/.test(s) ||
    /\bmoved from\b/.test(s)
  ) {
    return "Operating";
  }

  if (s === "closed") {
    return "Unknown";
  }

  if (s === "unknown" || s === "n/a" || s === "na") return "Unknown";
  return "Unknown";
}

export function isCoasterDefunct(coaster: CoasterLifecycleFields): boolean {
  return (
    normalizeLifecycleStatus(coaster.status, {
      closingYear: coaster.closing_year,
      openingYear: coaster.opening_year,
    }) === "Defunct"
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
        normalizeLifecycleStatus(coaster.status, {
          closingYear: coaster.closing_year,
          openingYear: coaster.opening_year,
        }) === "Operating",
    )
  ) {
    return "Operating";
  }
  return "Unknown";
}
