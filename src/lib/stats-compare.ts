import { isThrillCoaster } from "@/lib/coaster-dedup";
import { continentIdForCountryLabel } from "@/lib/country-continent";
import { cleanCoasterName, formatParkLabel } from "@/lib/display";
import type { Coaster } from "@/types/domain";

export type CompareCredit = {
  coasterId: number;
  name: string;
  parkId: number | null;
  parkName: string | null;
  country: string | null;
  lengthFt: number | null;
  speedMph: number | null;
  heightFt: number | null;
  inversions: number | null;
  durationS: number | null;
  totalRides: number;
  thrill: boolean;
};

export type CompareCreditInput = {
  coasterId: number;
  name: string;
  parkId?: number | null;
  parkName?: string | null;
  country?: string | null;
  coasterType?: string | null;
  manufacturer?: string | null;
  lengthFt?: number | null;
  speedMph?: number | null;
  heightFt?: number | null;
  inversions?: number | null;
  durationS?: number | null;
  totalRides?: number;
  status?: string | null;
};

export type CompareBucket = "both" | "only-you" | "only-them";

export type CompareDelta = {
  mine: number;
  theirs: number;
  delta: number;
  winner: "you" | "them" | "tie";
  label: string;
};

export type CompareNamedRecord = {
  coasterId: number;
  name: string;
  parkName: string | null;
  value: number;
};

export type CompareTotals = {
  uniqueCoasters: number;
  totalRides: number;
  parks: number;
  countries: number;
  continents: number;
  totalLengthFt: number;
  totalDurationS: number;
  totalInversions: number;
  averageSpeedMph: number | null;
  fastest: CompareNamedRecord | null;
  tallest: CompareNamedRecord | null;
  longest: CompareNamedRecord | null;
  mostInversions: CompareNamedRecord | null;
  longestDuration: CompareNamedRecord | null;
  mostRidden: CompareNamedRecord | null;
};

export type CompareParkHeadToHead = {
  key: string;
  parkId: number | null;
  parkName: string | null;
  country: string | null;
  label: string;
  mineCount: number;
  theirsCount: number;
  bothCount: number;
  onlyMine: CompareCredit[];
  onlyTheirs: CompareCredit[];
  both: CompareCredit[];
  delta: CompareDelta;
};

export type CompareOverlap = {
  both: CompareCredit[];
  onlyYou: CompareCredit[];
  onlyThem: CompareCredit[];
};

function creditName(credit: CompareCredit): string {
  return cleanCoasterName(credit.name) || credit.name || `Coaster ${credit.coasterId}`;
}

function sortCredits(a: CompareCredit, b: CompareCredit): number {
  const park = (a.parkName ?? "").localeCompare(b.parkName ?? "");
  if (park !== 0) return park;
  return creditName(a).localeCompare(creditName(b));
}

export function firstNested<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function toCompareCredit(input: CompareCreditInput): CompareCredit {
  const name = (input.name ?? "").trim() || `Coaster ${input.coasterId}`;
  const parkName = input.parkName?.trim() || null;
  const thrill = isThrillCoaster(
    {
      id: input.coasterId,
      park_id: input.parkId ?? 0,
      name,
      coaster_type: input.coasterType ?? "",
      manufacturer: input.manufacturer ?? null,
      status: input.status ?? "Operating",
      length_ft: input.lengthFt ?? null,
      speed_mph: input.speedMph ?? null,
      height_ft: input.heightFt ?? null,
      inversions: input.inversions ?? null,
      duration_s: input.durationS ?? null,
    } satisfies Coaster,
    parkName,
  );
  return {
    coasterId: input.coasterId,
    name,
    parkId: input.parkId ?? null,
    parkName,
    country: input.country?.trim() || null,
    lengthFt: input.lengthFt ?? null,
    speedMph: input.speedMph ?? null,
    heightFt: input.heightFt ?? null,
    inversions: input.inversions ?? null,
    durationS: input.durationS ?? null,
    totalRides: Math.max(1, input.totalRides ?? 1),
    thrill,
  };
}

export function dedupeCompareCredits(credits: CompareCredit[]): CompareCredit[] {
  const seen = new Set<number>();
  const out: CompareCredit[] = [];
  for (const credit of credits) {
    if (seen.has(credit.coasterId)) continue;
    seen.add(credit.coasterId);
    out.push(credit);
  }
  return out;
}

export function filterCompareCredits(
  credits: CompareCredit[],
  includeFamilyRides: boolean,
): CompareCredit[] {
  const unique = dedupeCompareCredits(credits);
  if (includeFamilyRides) return unique;
  return unique.filter((credit) => credit.thrill);
}

export function parkKeyForCredit(credit: CompareCredit): string {
  if (credit.parkId != null) return `id:${credit.parkId}`;
  const label = formatParkLabel(credit.parkName, credit.country);
  return label ? `name:${label}` : "unknown";
}

export function parkLabelForCredit(credit: CompareCredit): string {
  return formatParkLabel(credit.parkName, credit.country) || "Unknown park";
}

export function compareDelta(mine: number, theirs: number): CompareDelta {
  const delta = mine - theirs;
  if (delta === 0) {
    return { mine, theirs, delta, winner: "tie", label: "Tied" };
  }
  if (delta > 0) {
    return {
      mine,
      theirs,
      delta,
      winner: "you",
      label: `+${delta.toLocaleString()} you`,
    };
  }
  return {
    mine,
    theirs,
    delta,
    winner: "them",
    label: `+${Math.abs(delta).toLocaleString()} them`,
  };
}

export function buildCreditOverlap(
  mine: CompareCredit[],
  theirs: CompareCredit[],
): CompareOverlap {
  const mineById = new Map(mine.map((credit) => [credit.coasterId, credit]));
  const theirsById = new Map(theirs.map((credit) => [credit.coasterId, credit]));
  const both: CompareCredit[] = [];
  const onlyYou: CompareCredit[] = [];
  const onlyThem: CompareCredit[] = [];

  for (const credit of mine) {
    if (theirsById.has(credit.coasterId)) both.push(credit);
    else onlyYou.push(credit);
  }
  for (const credit of theirs) {
    if (!mineById.has(credit.coasterId)) onlyThem.push(credit);
  }

  both.sort(sortCredits);
  onlyYou.sort(sortCredits);
  onlyThem.sort(sortCredits);
  return { both, onlyYou, onlyThem };
}

export function creditsForPark(
  credits: CompareCredit[],
  parkKey: string | null,
): CompareCredit[] {
  if (!parkKey) return credits;
  return credits.filter((credit) => parkKeyForCredit(credit) === parkKey);
}

export function buildParkHeadToHead(
  mine: CompareCredit[],
  theirs: CompareCredit[],
): CompareParkHeadToHead[] {
  const keys = new Set<string>();
  const sample = new Map<string, CompareCredit>();
  for (const credit of [...mine, ...theirs]) {
    const key = parkKeyForCredit(credit);
    keys.add(key);
    if (!sample.has(key)) sample.set(key, credit);
  }

  const rows: CompareParkHeadToHead[] = [];
  for (const key of keys) {
    const parkMine = mine.filter((credit) => parkKeyForCredit(credit) === key);
    const parkTheirs = theirs.filter((credit) => parkKeyForCredit(credit) === key);
    const overlap = buildCreditOverlap(parkMine, parkTheirs);
    const example = sample.get(key);
    rows.push({
      key,
      parkId: example?.parkId ?? null,
      parkName: example?.parkName ?? null,
      country: example?.country ?? null,
      label: example ? parkLabelForCredit(example) : "Unknown park",
      mineCount: parkMine.length,
      theirsCount: parkTheirs.length,
      bothCount: overlap.both.length,
      onlyMine: overlap.onlyYou,
      onlyTheirs: overlap.onlyThem,
      both: overlap.both,
      delta: compareDelta(parkMine.length, parkTheirs.length),
    });
  }

  rows.sort((a, b) => {
    const gap = Math.abs(b.delta.delta) - Math.abs(a.delta.delta);
    if (gap !== 0) return gap;
    const themAhead = (b.theirsCount - b.mineCount) - (a.theirsCount - a.mineCount);
    if (themAhead !== 0) return themAhead;
    return a.label.localeCompare(b.label);
  });
  return rows;
}

function pickMaxRecord(
  credits: CompareCredit[],
  valueOf: (credit: CompareCredit) => number | null,
): CompareNamedRecord | null {
  let best: CompareNamedRecord | null = null;
  for (const credit of credits) {
    const value = valueOf(credit);
    if (value == null) continue;
    const name = creditName(credit);
    if (
      !best ||
      value > best.value ||
      (value === best.value && name.localeCompare(best.name) < 0)
    ) {
      best = {
        coasterId: credit.coasterId,
        name,
        parkName: credit.parkName,
        value,
      };
    }
  }
  return best;
}

export function buildCompareTotals(credits: CompareCredit[]): CompareTotals {
  const parks = new Set<string>();
  const countries = new Set<string>();
  const continents = new Set<string>();
  let totalLengthFt = 0;
  let totalDurationS = 0;
  let totalInversions = 0;
  let speedSum = 0;
  let speedCount = 0;
  let totalRides = 0;

  for (const credit of credits) {
    parks.add(parkKeyForCredit(credit));
    if (credit.country) countries.add(credit.country);
    const continent = continentIdForCountryLabel(credit.country);
    if (continent) continents.add(continent);
    if (credit.lengthFt != null) totalLengthFt += credit.lengthFt;
    if (credit.durationS != null) totalDurationS += credit.durationS;
    if (credit.inversions != null) totalInversions += credit.inversions;
    if (credit.speedMph != null) {
      speedSum += credit.speedMph;
      speedCount += 1;
    }
    totalRides += credit.totalRides;
  }

  return {
    uniqueCoasters: credits.length,
    totalRides,
    parks: parks.size,
    countries: countries.size,
    continents: continents.size,
    totalLengthFt,
    totalDurationS,
    totalInversions,
    averageSpeedMph: speedCount > 0 ? speedSum / speedCount : null,
    fastest: pickMaxRecord(credits, (credit) => credit.speedMph),
    tallest: pickMaxRecord(credits, (credit) => credit.heightFt),
    longest: pickMaxRecord(credits, (credit) => credit.lengthFt),
    mostInversions: pickMaxRecord(credits, (credit) => credit.inversions),
    longestDuration: pickMaxRecord(credits, (credit) => credit.durationS),
    mostRidden: pickMaxRecord(credits, (credit) => credit.totalRides),
  };
}

export function formatCompareDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "—";
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) {
    if (mins > 0) return `${hours}h ${mins}m`;
    return `${hours}h`;
  }
  if (mins > 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}

export function formatRecordDetail(
  record: CompareNamedRecord | null,
  formatValue: (value: number) => string,
): string {
  if (!record) return "—";
  const value = formatValue(record.value);
  const park = record.parkName ? ` · ${record.parkName}` : "";
  return `${record.name} (${value})${park}`;
}
