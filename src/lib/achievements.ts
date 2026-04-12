import { continentIdForCountryLabel } from "@/lib/country-continent";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";

/** One row per distinct coaster, with joined coaster + park fields (matches stats query + park_id). */
export type AchievementRide = {
  coaster_id: number;
  coasters?: {
    park_id: number;
    name: string;
    coaster_type: string;
    manufacturer: string | null;
    length_ft: number | null;
    speed_mph: number | null;
    height_ft: number | null;
    inversions: number | null;
    duration_s: number | null;
    parks?: { name: string; country: string } | null;
  } | null;
};

export type AchievementEval = {
  id: string;
  title: string;
  description: string;
  /** Progress uses rides that have this field populated; shown in UI when set. */
  dataNote?: string;
  target: number;
  current: number;
  unlocked: boolean;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function isBolligerMabillard(manufacturer: string | null | undefined): boolean {
  const m = norm(manufacturer).toLowerCase();
  if (!m) return false;
  return m.includes("bolliger") || m.includes("b & m") || m === "b&m" || m.includes("mabillard");
}

function isIntamin(manufacturer: string | null | undefined): boolean {
  const m = norm(manufacturer).toLowerCase();
  return m.includes("intamin");
}

/** Distinct coasters with effective type Wood (after Unknown → inference). */
function countWood(rides: AchievementRide[]): number {
  let n = 0;
  for (const r of rides) {
    const c = r.coasters;
    if (!c) continue;
    if (effectiveCoasterType(c.coaster_type, c.manufacturer) === "Wood") n++;
  }
  return n;
}

function countSteel(rides: AchievementRide[]): number {
  let n = 0;
  for (const r of rides) {
    const c = r.coasters;
    if (!c) continue;
    if (effectiveCoasterType(c.coaster_type, c.manufacturer) === "Steel") n++;
  }
  return n;
}

function countHybrid(rides: AchievementRide[]): number {
  let n = 0;
  for (const r of rides) {
    const c = r.coasters;
    if (!c) continue;
    if (effectiveCoasterType(c.coaster_type, c.manufacturer) === "Hybrid") n++;
  }
  return n;
}

function countManufacturer(
  rides: AchievementRide[],
  pred: (m: string | null | undefined) => boolean,
): number {
  let n = 0;
  for (const r of rides) {
    const c = r.coasters;
    if (!c) continue;
    if (pred(c.manufacturer)) n++;
  }
  return n;
}

/** Largest number of distinct coasters ridden at a single park. */
function maxCoastersAtOnePark(rides: AchievementRide[]): number {
  const byPark = new Map<number, number>();
  for (const r of rides) {
    const pid = r.coasters?.park_id;
    if (pid == null) continue;
    byPark.set(pid, (byPark.get(pid) ?? 0) + 1);
  }
  let max = 0;
  for (const v of byPark.values()) if (v > max) max = v;
  return max;
}

function sumField(
  rides: AchievementRide[],
  field: "length_ft" | "duration_s" | "inversions",
): number {
  let s = 0;
  for (const r of rides) {
    const v = r.coasters?.[field];
    if (v == null) continue;
    s += v;
  }
  return s;
}

function maxField(
  rides: AchievementRide[],
  field: "height_ft" | "inversions",
): number {
  let max = 0;
  let any = false;
  for (const r of rides) {
    const v = r.coasters?.[field];
    if (v == null) continue;
    any = true;
    if (v > max) max = v;
  }
  return any ? max : 0;
}

function distinctCountries(rides: AchievementRide[]): number {
  const set = new Set<string>();
  for (const r of rides) {
    const c = r.coasters?.parks?.country;
    if (c) set.add(c);
  }
  return set.size;
}

/** Distinct continents among ridden coasters (by mapped country → continent). */
function distinctContinents(rides: AchievementRide[]): number {
  const set = new Set<string>();
  for (const r of rides) {
    const country = r.coasters?.parks?.country;
    const id = continentIdForCountryLabel(country);
    if (id) set.add(id);
  }
  return set.size;
}

type Def = {
  id: string;
  title: string;
  description: string;
  dataNote?: string;
  target: number;
  current: (rides: AchievementRide[]) => number;
};

const DEFINITIONS: Def[] = [
  {
    id: "first_credit",
    title: "First credit",
    description: "Log your first coaster.",
    target: 1,
    current: (rides) => rides.length,
  },
  {
    id: "enthusiast_10",
    title: "Enthusiast",
    description: "Ride 10 different coasters.",
    target: 10,
    current: (rides) => rides.length,
  },
  {
    id: "collector_50",
    title: "Collector",
    description: "Ride 50 different coasters.",
    target: 50,
    current: (rides) => rides.length,
  },
  {
    id: "wood_5",
    title: "Wood lover",
    description: "Ride 5 wooden coasters (by type).",
    target: 5,
    current: countWood,
  },
  {
    id: "steel_15",
    title: "Steel fan",
    description: "Ride 15 steel coasters (by type).",
    target: 15,
    current: countSteel,
  },
  {
    id: "hybrid_3",
    title: "Hybrid hunter",
    description: "Ride 3 hybrid coasters (by type).",
    target: 3,
    current: countHybrid,
  },
  {
    id: "bm_5",
    title: "B&M collection",
    description: "Ride 5 coasters manufactured by Bolliger & Mabillard.",
    target: 5,
    current: (rides) => countManufacturer(rides, isBolligerMabillard),
  },
  {
    id: "intamin_3",
    title: "Intamin fan",
    description: "Ride 3 Intamin coasters.",
    target: 3,
    current: (rides) => countManufacturer(rides, isIntamin),
  },
  {
    id: "one_park_10",
    title: "Park regular",
    description: "Ride 10 different coasters at a single park.",
    target: 10,
    current: maxCoastersAtOnePark,
  },
  {
    id: "inversions_sum_100",
    title: "Inversion addict",
    description: "Accumulate 100 total inversions across your ridden coasters (counts each coaster once).",
    target: 100,
    current: (rides) => sumField(rides, "inversions"),
    dataNote: "Counts coasters that have inversion data.",
  },
  {
    id: "single_coaster_7_inversions",
    title: "Seven-looper",
    description: "Ride a coaster with at least 7 inversions.",
    target: 7,
    current: (rides) => maxField(rides, "inversions"),
    dataNote: "Uses the highest inversion count among your ridden coasters.",
  },
  {
    id: "length_mile",
    title: "Mile of track",
    description: "Ride at least 5,280 ft of track in total (sum of credited coasters).",
    target: 5280,
    current: (rides) => sumField(rides, "length_ft"),
    dataNote: "Sums length only for coasters with length data.",
  },
  {
    id: "duration_hour",
    title: "Hour on board",
    description: "Spend at least 1 hour of ride time in total (sum of track durations).",
    target: 3600,
    current: (rides) => sumField(rides, "duration_s"),
    dataNote: "Sums duration only for coasters with duration data.",
  },
  {
    id: "height_200",
    title: "Skyline",
    description: "Ride a coaster at least 200 ft tall.",
    target: 200,
    current: (rides) => maxField(rides, "height_ft"),
    dataNote: "Uses the tallest height among your ridden coasters with height data.",
  },
  {
    id: "countries_3",
    title: "Globetrotter",
    description: "Ride coasters in 3 different countries.",
    target: 3,
    current: distinctCountries,
  },
  {
    id: "continents_2",
    title: "Continental",
    description: "Ride coasters on more than one continent (by park country).",
    target: 2,
    current: distinctContinents,
    dataNote: "Continents are inferred from country names in the catalog; unmapped countries do not count.",
  },
];

/**
 * Evaluate all achievements from deduplicated-by-coaster ride rows.
 * `current` is the raw metric (may exceed `target`); UI can clamp the progress bar.
 */
export function evaluateAchievements(uniqueRides: AchievementRide[]): AchievementEval[] {
  return DEFINITIONS.map((d) => {
    const raw = d.current(uniqueRides);
    const current = Math.max(0, raw);
    const unlocked = current >= d.target;
    return {
      id: d.id,
      title: d.title,
      description: d.description,
      dataNote: d.dataNote,
      target: d.target,
      current,
      unlocked,
    };
  });
}

/** Sort: unlocked first, then by progress ratio (current/target) descending for locked. */
export function sortAchievementsForDisplay(evals: AchievementEval[]): AchievementEval[] {
  return [...evals].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (!a.unlocked && !b.unlocked) {
      const ra = a.target > 0 ? a.current / a.target : 0;
      const rb = b.target > 0 ? b.current / b.target : 0;
      if (rb !== ra) return rb - ra;
    }
    return a.title.localeCompare(b.title);
  });
}

export const ACHIEVEMENT_COUNT = DEFINITIONS.length;
