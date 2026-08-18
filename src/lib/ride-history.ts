/** Configurable cap for rides of one coaster on one calendar day (matches DB check). */
export const MAX_RIDES_PER_EVENT = 99;

export type RideEventSource = "legacy_credit" | "user_log";

export type RideEvent = {
  userId: string;
  coasterId: number;
  /** YYYY-MM-DD, or null when the ride day is unknown (migrated credits). */
  riddenOn: string | null;
  quantity: number;
  source?: RideEventSource;
  createdAt?: string | null;
};

export type RideDayLog = {
  id: number;
  riddenOn: string | null;
  quantity: number;
};

export type RideCreditSummary = {
  coasterId: number;
  totalRides: number;
  firstRiddenOn: string | null;
  lastRiddenOn: string | null;
};

/** Dated days newest first; undated legacy credits last. */
export function sortRideDayLogs(days: RideDayLog[]): RideDayLog[] {
  return [...days].sort((a, b) => {
    if (a.riddenOn == null && b.riddenOn == null) return 0;
    if (a.riddenOn == null) return 1;
    if (b.riddenOn == null) return -1;
    return a.riddenOn < b.riddenOn ? 1 : a.riddenOn > b.riddenOn ? -1 : 0;
  });
}

export type RideHistoryTotals = {
  uniqueCoasters: number;
  totalRides: number;
  byCoaster: Map<number, RideCreditSummary>;
  /** Dated events only — undated legacy credits are omitted (future calendar/trips). */
  byDate: Map<string, Array<{ coasterId: number; quantity: number }>>;
};

export type LegacyCredit = {
  userId: string;
  coasterId: number;
  riddenAt?: string | null;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar day as YYYY-MM-DD (avoids UTC off-by-one from Date#toISOString). */
export function localDateISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isRideDateISO(value: string | null | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  const [, ys, ms, ds] = value.match(DATE_RE) ?? [];
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Format a YYYY-MM-DD ride day without timezone shift. */
export function formatRideOnDate(isoDate: string | null | undefined): string | null {
  if (!isRideDateISO(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRideDayLabel(riddenOn: string | null | undefined): string {
  return formatRideOnDate(riddenOn) ?? "No date";
}

export function formatRideCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 time" : `${n.toLocaleString()} times`;
}

export function parseRideQuantity(value: unknown): number | null {
  if (typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > MAX_RIDES_PER_EVENT) return null;
  return n;
}

function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Aggregate ride events into unique credits vs total rides.
 * Unique coasters = distinct coasterId. Total rides = sum(quantity).
 * An undated legacy credit is only a placeholder: once that coaster has a
 * real ride day, the placeholder is not counted as an extra ride.
 */
export function summarizeRideEvents(events: RideEvent[]): RideHistoryTotals {
  const datedCoasters = new Set<number>();
  for (const event of events) {
    if (event.riddenOn && isRideDateISO(event.riddenOn)) datedCoasters.add(event.coasterId);
  }

  const byCoaster = new Map<number, RideCreditSummary>();
  const byDate = new Map<string, Array<{ coasterId: number; quantity: number }>>();
  let totalRides = 0;

  for (const event of events) {
    if (!event.riddenOn && datedCoasters.has(event.coasterId)) continue;
    const quantity = parseRideQuantity(event.quantity);
    if (quantity == null) continue;
    totalRides += quantity;

    const prev = byCoaster.get(event.coasterId);
    if (!prev) {
      byCoaster.set(event.coasterId, {
        coasterId: event.coasterId,
        totalRides: quantity,
        firstRiddenOn: event.riddenOn,
        lastRiddenOn: event.riddenOn,
      });
    } else {
      prev.totalRides += quantity;
      prev.firstRiddenOn = minDate(prev.firstRiddenOn, event.riddenOn);
      prev.lastRiddenOn = maxDate(prev.lastRiddenOn, event.riddenOn);
    }

    if (event.riddenOn && isRideDateISO(event.riddenOn)) {
      const day = byDate.get(event.riddenOn) ?? [];
      const existing = day.find((row) => row.coasterId === event.coasterId);
      if (existing) existing.quantity += quantity;
      else day.push({ coasterId: event.coasterId, quantity });
      byDate.set(event.riddenOn, day);
    }
  }

  return {
    uniqueCoasters: byCoaster.size,
    totalRides,
    byCoaster,
    byDate,
  };
}

export function mostRiddenCoaster(
  byCoaster: Map<number, RideCreditSummary>,
): RideCreditSummary | null {
  let top: RideCreditSummary | null = null;
  for (const summary of byCoaster.values()) {
    if (!top || summary.totalRides > top.totalRides) top = summary;
  }
  return top;
}

/**
 * Existing unique credits become one undated ride each.
 * That undated row is a placeholder until a real ride day is logged.
 * Does not copy ridden_at into ridden_on (log time is not a ride day).
 * Idempotent: one output row per user+coaster.
 */
export function migrateCreditsToEvents(credits: LegacyCredit[]): RideEvent[] {
  const seen = new Set<string>();
  const out: RideEvent[] = [];
  for (const credit of credits) {
    const key = `${credit.userId}:${credit.coasterId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      userId: credit.userId,
      coasterId: credit.coasterId,
      riddenOn: null,
      quantity: 1,
      source: "legacy_credit",
      createdAt: credit.riddenAt ?? null,
    });
  }
  return out;
}

export type StatsCopyInput = {
  displayName: string | null;
  includeFamilyRides: boolean;
  uniqueCoasters: number;
  totalRides: number;
  parksVisited: number;
  countriesVisited: number;
  continentsVisited: number;
  totalTrackLength: string;
  totalRideTime: string;
  totalInversions: string;
  averageSpeed: string;
  favoriteRideLabel: string;
  favoriteParkLabel: string;
  mostRidden?: { name: string; rides: number } | null;
  fastest?: string | null;
  tallest?: string | null;
  longest?: string | null;
  mostInversions?: string | null;
  longestRide?: string | null;
};

/** Plain-text "Copy my stats" body. Unique credits stay the headline coaster count. */
export function buildStatsCopyText(input: StatsCopyInput): string {
  const shareTitle = input.displayName
    ? `${input.displayName}'s CoasterTrak stats`
    : "My CoasterTrak stats";
  const mostRidden =
    input.mostRidden && input.mostRidden.rides > 1
      ? `- Most ridden: ${input.mostRidden.name} (${input.mostRidden.rides} rides)`
      : null;
  return [
    shareTitle,
    `- Ride filter: ${input.includeFamilyRides ? "Includes kiddie/family rides" : "Thrill rides only"}`,
    `- Coaster credits: ${input.uniqueCoasters}`,
    `- Total rides: ${input.totalRides}`,
    `- Parks visited: ${input.parksVisited}`,
    `- Countries visited: ${input.countriesVisited}`,
    `- Continents visited: ${input.continentsVisited}`,
    `- Total track length: ${input.totalTrackLength}`,
    `- Total ride time: ${input.totalRideTime}`,
    `- Total inversions: ${input.totalInversions}`,
    `- Average speed: ${input.averageSpeed}`,
    `- Favorite ride: ${input.favoriteRideLabel}`,
    `- Favorite park: ${input.favoriteParkLabel}`,
    mostRidden,
    input.fastest ? `- Fastest coaster: ${input.fastest}` : null,
    input.tallest ? `- Tallest coaster: ${input.tallest}` : null,
    input.longest ? `- Longest coaster: ${input.longest}` : null,
    input.mostInversions ? `- Most inversions: ${input.mostInversions}` : null,
    input.longestRide ? `- Longest ride: ${input.longestRide}` : null,
    "",
    "Track your rides on CoasterTrak: https://coastertrak.com",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
