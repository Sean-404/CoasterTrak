import { isRideDateISO } from "@/lib/ride-history";

export type MonthWrappedEvent = {
  coasterId: number;
  /** YYYY-MM-DD */
  riddenOn: string;
  quantity: number;
};

export type MonthWrappedRideMeta = {
  coasterId: number;
  name: string;
  rating: number | null;
  parkId: number | null;
  parkName: string | null;
  parkCountry: string | null;
  speedMph: number | null;
  heightFt: number | null;
};

export type MonthWrappedTopRide = {
  coasterId: number;
  name: string;
  parkLabel: string | null;
  rating: number | null;
  ridesInPeriod: number;
  reason: "highest_rated" | "most_ridden" | "only_credit";
};

export type MonthWrappedTopPark = {
  parkId: number;
  name: string;
  country: string | null;
  creditsInPeriod: number;
  ridesInPeriod: number;
};

export type WrappedPeriodScope = "year" | "month" | "all";

export type MonthWrappedSummary = {
  /** `all`, YYYY, or YYYY-MM */
  period: string;
  scope: WrappedPeriodScope;
  label: string;
  empty: boolean;
  uniqueCredits: number;
  totalRides: number;
  uniqueParks: number;
  /** Dated active days; 0 for all-time. */
  activeDays: number;
  topRide: MonthWrappedTopRide | null;
  /** Parks ranked by rides (then credits) in the period. */
  parks: MonthWrappedTopPark[];
  /** First entry of `parks`, kept for convenience. */
  topPark: MonthWrappedTopPark | null;
  tallestRide: { name: string; heightFt: number; parkLabel: string | null } | null;
  fastestRide: { name: string; speedMph: number; parkLabel: string | null } | null;
};

export const ALL_TIME_WRAPPED_PERIOD = "all";

const YEAR_RE = /^(\d{4})$/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isAllTimePeriod(value: string | null | undefined): value is typeof ALL_TIME_WRAPPED_PERIOD {
  return value === ALL_TIME_WRAPPED_PERIOD;
}

export function isCalendarYear(value: string | null | undefined): value is string {
  if (!value || !YEAR_RE.test(value)) return false;
  const y = Number(value);
  return y >= 1990 && y <= 2100;
}

export function isYearMonth(value: string | null | undefined): value is string {
  if (!value || !YEAR_MONTH_RE.test(value)) return false;
  const [, ys, ms] = value.match(YEAR_MONTH_RE) ?? [];
  const y = Number(ys);
  const m = Number(ms);
  return y >= 1990 && y <= 2100 && m >= 1 && m <= 12;
}

/** `all`, YYYY (full year), or YYYY-MM (calendar month). */
export function isWrappedPeriod(value: string | null | undefined): value is string {
  return isAllTimePeriod(value) || isCalendarYear(value) || isYearMonth(value);
}

export function wrappedPeriodScope(period: string): WrappedPeriodScope | null {
  if (isAllTimePeriod(period)) return "all";
  if (isCalendarYear(period)) return "year";
  if (isYearMonth(period)) return "month";
  return null;
}

/** Inclusive YYYY-MM-DD bounds for a year or month period. Null for all-time. */
export function periodDateRange(period: string): { start: string; end: string } | null {
  if (isAllTimePeriod(period)) return null;
  if (isCalendarYear(period)) {
    return { start: `${period}-01-01`, end: `${period}-12-31` };
  }
  return monthDateRange(period);
}

/** Calendar month bounds as inclusive YYYY-MM-DD. */
export function monthDateRange(yearMonth: string): { start: string; end: string } | null {
  if (!isYearMonth(yearMonth)) return null;
  const [ys, ms] = yearMonth.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${ys}-${ms}-01`,
    end: `${ys}-${ms}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function formatYearMonthLabel(yearMonth: string): string {
  if (!isYearMonth(yearMonth)) return yearMonth;
  const [y, m] = yearMonth.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatWrappedPeriodLabel(period: string): string {
  if (isAllTimePeriod(period)) return "All-time";
  if (isCalendarYear(period)) return period;
  return formatYearMonthLabel(period);
}

/** Previous calendar month as YYYY-MM (local). */
export function previousYearMonth(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Current calendar month as YYYY-MM (local). */
export function currentYearMonth(from: Date = new Date()): string {
  return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
}

/** Current calendar year as YYYY (local). */
export function currentCalendarYear(from: Date = new Date()): string {
  return String(from.getFullYear());
}

/** Recent months newest-first, including current month. */
export function listRecentYearMonths(count: number, from: Date = new Date()): string[] {
  const n = Math.max(1, Math.min(36, count));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export type WrappedPeriodOption = {
  value: string;
  label: string;
  scope: WrappedPeriodScope;
};

/**
 * Picker options: All-time first, then full years (newest first), then recent months.
 */
export function listWrappedPeriodOptions(
  monthCount = 18,
  yearCount = 4,
  from: Date = new Date(),
): WrappedPeriodOption[] {
  const years = new Set<string>();
  const yMax = Math.max(1, Math.min(12, yearCount));
  for (let i = 0; i < yMax; i++) {
    years.add(String(from.getFullYear() - i));
  }
  const months = listRecentYearMonths(monthCount, from);
  for (const ym of months) {
    years.add(ym.slice(0, 4));
  }

  const sortedYears = [...years].sort((a, b) => b.localeCompare(a));
  const out: WrappedPeriodOption[] = [
    { value: ALL_TIME_WRAPPED_PERIOD, label: "All-time", scope: "all" },
  ];
  for (const year of sortedYears) {
    out.push({ value: year, label: year, scope: "year" });
    for (const ym of months) {
      if (ym.startsWith(`${year}-`)) {
        out.push({ value: ym, label: formatYearMonthLabel(ym), scope: "month" });
      }
    }
  }
  return out;
}

function parkLabel(meta: MonthWrappedRideMeta | undefined): string | null {
  if (!meta?.parkName?.trim()) return null;
  const country = meta.parkCountry?.trim();
  return country ? `${meta.parkName.trim()} · ${country}` : meta.parkName.trim();
}

function emptySummary(period: string, scope: WrappedPeriodScope, label: string): MonthWrappedSummary {
  return {
    period,
    scope,
    label,
    empty: true,
    uniqueCredits: 0,
    totalRides: 0,
    uniqueParks: 0,
    activeDays: 0,
    topRide: null,
    parks: [],
    topPark: null,
    tallestRide: null,
    fastestRide: null,
  };
}

/**
 * Build a Wrapped summary for a year (YYYY) or month (YYYY-MM) from dated ride events.
 * Undated events are ignored. For all-time, use `buildAllTimeWrappedSummary`.
 */
export function buildWrappedSummary(
  period: string,
  events: MonthWrappedEvent[],
  metaByCoasterId: Map<number, MonthWrappedRideMeta>,
): MonthWrappedSummary {
  if (isAllTimePeriod(period)) {
    return buildAllTimeWrappedSummary([...metaByCoasterId.keys()], metaByCoasterId);
  }

  const scope = wrappedPeriodScope(period);
  const label = formatWrappedPeriodLabel(period);
  if (!scope) return emptySummary(period, "month", label);

  const range = periodDateRange(period);
  const emptyBase = emptySummary(period, scope, label);
  if (!range) return emptyBase;

  const inPeriod = events.filter(
    (e) =>
      isRideDateISO(e.riddenOn) &&
      e.riddenOn >= range.start &&
      e.riddenOn <= range.end &&
      e.quantity > 0,
  );
  if (inPeriod.length === 0) return emptyBase;

  const ridesByCoaster = new Map<number, number>();
  const days = new Set<string>();
  for (const e of inPeriod) {
    ridesByCoaster.set(e.coasterId, (ridesByCoaster.get(e.coasterId) ?? 0) + e.quantity);
    days.add(e.riddenOn);
  }

  return finishWrappedSummary({
    period,
    scope,
    label,
    ridesByCoaster,
    activeDays: days.size,
    metaByCoasterId,
    totalRidesOverride: inPeriod.reduce((sum, e) => sum + e.quantity, 0),
  });
}

export type AllTimeCreditInput = {
  coasterId: number;
  /** Total rides for this credit when known; defaults to 1. */
  totalRides?: number;
};

/**
 * All-time Wrapped from unique credits (dated or undated). No calendar inventing.
 */
export function buildAllTimeWrappedSummary(
  credits: Array<number | AllTimeCreditInput>,
  metaByCoasterId: Map<number, MonthWrappedRideMeta>,
): MonthWrappedSummary {
  const ridesByCoaster = new Map<number, number>();
  for (const entry of credits) {
    const coasterId = typeof entry === "number" ? entry : entry.coasterId;
    const qty =
      typeof entry === "number" ? 1 : Math.max(1, Math.trunc(entry.totalRides ?? 1));
    if (!Number.isFinite(coasterId) || coasterId <= 0) continue;
    ridesByCoaster.set(coasterId, (ridesByCoaster.get(coasterId) ?? 0) + qty);
  }

  if (ridesByCoaster.size === 0) {
    return emptySummary(ALL_TIME_WRAPPED_PERIOD, "all", "All-time");
  }

  return finishWrappedSummary({
    period: ALL_TIME_WRAPPED_PERIOD,
    scope: "all",
    label: "All-time",
    ridesByCoaster,
    activeDays: 0,
    metaByCoasterId,
  });
}

function finishWrappedSummary(input: {
  period: string;
  scope: WrappedPeriodScope;
  label: string;
  ridesByCoaster: Map<number, number>;
  activeDays: number;
  metaByCoasterId: Map<number, MonthWrappedRideMeta>;
  totalRidesOverride?: number;
}): MonthWrappedSummary {
  const { period, scope, label, ridesByCoaster, activeDays, metaByCoasterId } = input;
  const coasterIds = [...ridesByCoaster.keys()];
  const parkAgg = new Map<
    number,
    { name: string; country: string | null; credits: number; rides: number }
  >();

  let tallest: MonthWrappedSummary["tallestRide"] = null;
  let fastest: MonthWrappedSummary["fastestRide"] = null;
  let totalRides = input.totalRidesOverride ?? 0;

  for (const coasterId of coasterIds) {
    const meta = metaByCoasterId.get(coasterId);
    const ridesInPeriod = ridesByCoaster.get(coasterId) ?? 0;
    if (input.totalRidesOverride == null) totalRides += ridesInPeriod;
    if (meta?.parkId != null && meta.parkName?.trim()) {
      const prev = parkAgg.get(meta.parkId);
      if (prev) {
        prev.credits += 1;
        prev.rides += ridesInPeriod;
      } else {
        parkAgg.set(meta.parkId, {
          name: meta.parkName.trim(),
          country: meta.parkCountry?.trim() || null,
          credits: 1,
          rides: ridesInPeriod,
        });
      }
    }
    if (meta?.heightFt != null && Number.isFinite(meta.heightFt)) {
      if (!tallest || meta.heightFt > tallest.heightFt) {
        tallest = {
          name: meta.name,
          heightFt: meta.heightFt,
          parkLabel: parkLabel(meta),
        };
      }
    }
    if (meta?.speedMph != null && Number.isFinite(meta.speedMph)) {
      if (!fastest || meta.speedMph > fastest.speedMph) {
        fastest = {
          name: meta.name,
          speedMph: meta.speedMph,
          parkLabel: parkLabel(meta),
        };
      }
    }
  }

  const ranked = coasterIds
    .map((coasterId) => {
      const meta = metaByCoasterId.get(coasterId);
      return {
        coasterId,
        name: meta?.name?.trim() || `Coaster ${coasterId}`,
        parkLabel: parkLabel(meta),
        rating: meta?.rating ?? null,
        ridesInPeriod: ridesByCoaster.get(coasterId) ?? 0,
      };
    })
    .sort((a, b) => {
      const ar = a.rating ?? -1;
      const br = b.rating ?? -1;
      if (br !== ar) return br - ar;
      if (b.ridesInPeriod !== a.ridesInPeriod) return b.ridesInPeriod - a.ridesInPeriod;
      return a.name.localeCompare(b.name);
    });

  const best = ranked[0] ?? null;
  let topRide: MonthWrappedTopRide | null = null;
  if (best) {
    const anyRated = ranked.some((r) => r.rating != null);
    const reason: MonthWrappedTopRide["reason"] =
      ranked.length === 1
        ? "only_credit"
        : anyRated && best.rating != null
          ? "highest_rated"
          : "most_ridden";
    topRide = { ...best, reason };
  }

  const parks = [...parkAgg.entries()]
    .map(([parkId, p]) => ({
      parkId,
      name: p.name,
      country: p.country,
      creditsInPeriod: p.credits,
      ridesInPeriod: p.rides,
    }))
    .sort((a, b) => {
      if (b.ridesInPeriod !== a.ridesInPeriod) return b.ridesInPeriod - a.ridesInPeriod;
      if (b.creditsInPeriod !== a.creditsInPeriod) return b.creditsInPeriod - a.creditsInPeriod;
      return a.name.localeCompare(b.name);
    });

  return {
    period,
    scope,
    label,
    empty: false,
    uniqueCredits: coasterIds.length,
    totalRides,
    uniqueParks: parks.length,
    activeDays,
    topRide,
    parks,
    topPark: parks[0] ?? null,
    tallestRide: tallest,
    fastestRide: fastest,
  };
}

/** @deprecated Prefer buildWrappedSummary — kept for existing call sites/tests. */
export function buildMonthWrappedSummary(
  yearMonth: string,
  events: MonthWrappedEvent[],
  metaByCoasterId: Map<number, MonthWrappedRideMeta>,
): MonthWrappedSummary {
  return buildWrappedSummary(yearMonth, events, metaByCoasterId);
}

export function topRideReasonLabel(
  reason: MonthWrappedTopRide["reason"],
  scope: WrappedPeriodScope = "month",
): string {
  const when =
    scope === "all" ? "all time" : scope === "year" ? "this year" : "this month";
  if (reason === "highest_rated") {
    return scope === "all"
      ? "Highest star rating among your credits"
      : `Highest star rating among rides dated ${when}`;
  }
  if (reason === "most_ridden") {
    return scope === "all" ? "Most rides among your credits" : `Most rides dated ${when}`;
  }
  return scope === "all" ? "Your only credit so far" : `Your only dated credit ${when}`;
}
