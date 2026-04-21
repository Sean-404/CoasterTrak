import { continentIdForCountryLabel } from "@/lib/country-continent";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";

/** One row per distinct coaster, with joined coaster + park fields (matches stats query + park_id). */
export type AchievementRide = {
  coaster_id: number;
  /** When the credit was logged; used for “unlocked at” ordering. */
  ridden_at?: string | null;
  coasters?: {
    park_id: number;
    name: string;
    wikidata_id?: string | null;
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

/** Rough grind tier for badges — not tied to unlock difficulty alone. */
export type AchievementRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

const RARITY_SORT_KEY: Record<AchievementRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
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
  /** ISO timestamp of the credit that first unlocked this achievement, if known. */
  unlockedAt?: string | null;
  rarity: AchievementRarity;
};

export type AchievementMetrics = {
  friendCount: number;
  /** Accepted friend timestamps (oldest → newest), used for friend-achievement unlock times. */
  friendAcceptedAt: string[];
};

const DEFAULT_METRICS: AchievementMetrics = {
  friendCount: 0,
  friendAcceptedAt: [],
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** Remove parenthetical asides from achievement copy for cleaner UI. */
export function stripAchievementDisplayText(text: string): string {
  if (!text) return text;
  return text.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
}

/** One credit per coaster, earliest `ridden_at` kept, sorted ascending for unlock simulation. */
export function ridesChronologicalUnique(rides: AchievementRide[]): AchievementRide[] {
  const byCoaster = new Map<number, AchievementRide>();
  for (const r of rides) {
    const prev = byCoaster.get(r.coaster_id);
    if (!prev) {
      byCoaster.set(r.coaster_id, r);
      continue;
    }
    const tPrev = new Date(prev.ridden_at ?? 0).getTime();
    const tCur = new Date(r.ridden_at ?? 0).getTime();
    if (Number.isFinite(tCur) && (!Number.isFinite(tPrev) || tCur < tPrev)) {
      byCoaster.set(r.coaster_id, r);
    }
  }
  return [...byCoaster.values()].sort((a, b) => {
    const ta = new Date(a.ridden_at ?? 0).getTime();
    const tb = new Date(b.ridden_at ?? 0).getTime();
    return ta - tb;
  });
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

function isVekoma(manufacturer: string | null | undefined): boolean {
  return norm(manufacturer).toLowerCase().includes("vekoma");
}

function isMackRides(manufacturer: string | null | undefined): boolean {
  const m = norm(manufacturer).toLowerCase();
  return m.includes("mack rides") || m.includes("mack gmbh") || m === "mack";
}

function isRockyMountain(manufacturer: string | null | undefined): boolean {
  const m = norm(manufacturer).toLowerCase();
  return m.includes("rocky mountain") || m === "rmc";
}

function isGerstlauer(manufacturer: string | null | undefined): boolean {
  return norm(manufacturer).toLowerCase().includes("gerstlauer");
}

function isPremierRides(manufacturer: string | null | undefined): boolean {
  return norm(manufacturer).toLowerCase().includes("premier rides");
}

/** Arrow Dynamics / Development / Huss or S&S Sansei (classic steel loopers). */
function isArrowOrSS(manufacturer: string | null | undefined): boolean {
  const m = norm(manufacturer).toLowerCase();
  if (m.includes("arrow dynamics") || m.includes("arrow development") || m.includes("arrow huss")) return true;
  if (m.includes("s&s") || m.includes("sansei")) return true;
  return false;
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

function countEffectiveType(rides: AchievementRide[], type: string): number {
  let n = 0;
  for (const r of rides) {
    const c = r.coasters;
    if (!c) continue;
    if (effectiveCoasterType(c.coaster_type, c.manufacturer) === type) n++;
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

/** Type-label hints when inversion counts are missing (inverted ≠ “has inversions” in industry terms). */
function catalogSuggestsInvertingRide(c: NonNullable<AchievementRide["coasters"]>): boolean {
  const eff = effectiveCoasterType(c.coaster_type, c.manufacturer);
  if (eff === "Inverted") return true;
  const raw = (c.coaster_type ?? "").toLowerCase();
  if (raw.includes("invert")) return true;
  if (raw.includes("flying")) return true;
  if (raw.includes("floorless")) return true;
  if (raw.includes("dive")) return true;
  if (raw.includes("wing")) return true;
  if (raw.includes("suspended") && raw.includes("coaster")) return true;
  return false;
}

/** One credit counts if the catalog reports inversions &gt; 0, or suggests an upside-down style when the count is missing. */
function rideQualifiesUpsideDown(c: NonNullable<AchievementRide["coasters"]>): boolean {
  const inv = c.inversions;
  if (inv != null) return inv > 0;
  return catalogSuggestsInvertingRide(c);
}

function countUpsideDownCoasters(rides: AchievementRide[]): number {
  let n = 0;
  for (const r of rides) {
    const c = r.coasters;
    if (!c) continue;
    if (rideQualifiesUpsideDown(c)) n++;
  }
  return n;
}

/** Sum inversion elements: use catalog number when present; if missing but type suggests inverting, count 1 as a lower bound. */
function sumInversionsForAchievements(rides: AchievementRide[]): number {
  let s = 0;
  for (const r of rides) {
    const c = r.coasters;
    if (!c) continue;
    if (c.inversions != null) {
      s += c.inversions;
      continue;
    }
    if (catalogSuggestsInvertingRide(c)) s += 1;
  }
  return s;
}

function sumField(
  rides: AchievementRide[],
  field: "length_ft" | "duration_s" | "inversions",
): number {
  if (field === "inversions") return sumInversionsForAchievements(rides);
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
  field: "height_ft" | "inversions" | "speed_mph",
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

function distinctParks(rides: AchievementRide[]): number {
  const set = new Set<number>();
  for (const r of rides) {
    const pid = r.coasters?.park_id;
    if (pid != null) set.add(pid);
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
  current: (rides: AchievementRide[], metrics: AchievementMetrics) => number;
};

export const KARMAN_LINE_FT = 328_084;

/** Per-achievement rarity for UI badges (defaults to common if omitted). */
const RARITY: Partial<Record<string, AchievementRarity>> = {
  first_credit: "common",
  friends_1: "common",
  friends_5: "rare",
  friends_10: "epic",
  credits_3: "common",
  credits_5: "common",
  wood_1: "common",
  steel_3: "common",
  parks_2: "common",
  countries_2: "common",
  inversions_sum_10: "common",
  speed_40: "common",
  enthusiast_10: "uncommon",
  collector_50: "rare",
  wood_5: "uncommon",
  steel_15: "uncommon",
  hybrid_3: "uncommon",
  bm_5: "uncommon",
  intamin_3: "uncommon",
  one_park_10: "uncommon",
  inversions_sum_100: "epic",
  single_coaster_7_inversions: "rare",
  length_mile: "uncommon",
  duration_hour: "uncommon",
  height_200: "rare",
  countries_3: "uncommon",
  continents_2: "uncommon",
  veteran_100: "epic",
  legend_200: "legendary",
  wood_10: "rare",
  steel_25: "rare",
  hybrid_8: "rare",
  inverted_3: "uncommon",
  upside_down_3: "uncommon",
  launch_3: "uncommon",
  vekoma_3: "uncommon",
  mack_3: "uncommon",
  rmc_3: "uncommon",
  gerstlauer_3: "uncommon",
  premier_3: "uncommon",
  arrow_ss_3: "uncommon",
  parks_5: "uncommon",
  parks_15: "rare",
  speed_60: "uncommon",
  speed_100: "rare",
  countries_5: "rare",
  countries_10: "epic",
  continents_3: "epic",
  length_five_miles: "legendary",
  length_to_karman: "legendary",
  duration_two_hours: "legendary",
  inversions_sum_500: "legendary",
  single_coaster_10_inversions: "epic",
  height_300: "epic",
};

function rarityForAchievementId(id: string): AchievementRarity {
  return RARITY[id] ?? "common";
}

const DEFINITIONS: Def[] = [
  {
    id: "first_credit",
    title: "First credit",
    description: "Log your first coaster.",
    target: 1,
    current: (rides) => rides.length,
  },
  {
    id: "friends_1",
    title: "First connection",
    description: "Add your first friend.",
    target: 1,
    current: (_rides, metrics) => metrics.friendCount,
  },
  {
    id: "friends_5",
    title: "Coaster crew",
    description: "Have 5 accepted friends.",
    target: 5,
    current: (_rides, metrics) => metrics.friendCount,
  },
  {
    id: "friends_10",
    title: "Social track star",
    description: "Have 10 accepted friends.",
    target: 10,
    current: (_rides, metrics) => metrics.friendCount,
  },
  {
    id: "credits_3",
    title: "Getting rolling",
    description: "Ride 3 different coasters.",
    target: 3,
    current: (rides) => rides.length,
  },
  {
    id: "credits_5",
    title: "Five and counting",
    description: "Ride 5 different coasters.",
    target: 5,
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
    id: "wood_1",
    title: "Wooden spin",
    description: "Ride a wooden coaster (by type).",
    target: 1,
    current: countWood,
  },
  {
    id: "wood_5",
    title: "Wood lover",
    description: "Ride 5 wooden coasters (by type).",
    target: 5,
    current: countWood,
  },
  {
    id: "steel_3",
    title: "Steel sampler",
    description: "Ride 3 steel coasters (by type).",
    target: 3,
    current: countSteel,
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
    id: "inversions_sum_10",
    title: "Inversion starter",
    description: "Accumulate 10 total inversions across your ridden coasters (counts each coaster once).",
    target: 10,
    current: (rides) => sumField(rides, "inversions"),
    dataNote:
      "Uses catalog inversion counts when present; if missing, inverting ride types count as 1 toward the total.",
  },
  {
    id: "inversions_sum_100",
    title: "Inversion addict",
    description: "Accumulate 100 total inversions across your ridden coasters (counts each coaster once).",
    target: 100,
    current: (rides) => sumField(rides, "inversions"),
    dataNote:
      "Uses catalog inversion counts when present; if missing, inverting ride types count as 1 toward the total.",
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
    id: "countries_2",
    title: "Two flags",
    description: "Ride coasters in 2 different countries.",
    target: 2,
    current: distinctCountries,
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
  {
    id: "veteran_100",
    title: "Veteran",
    description: "Ride 100 different coasters.",
    target: 100,
    current: (rides) => rides.length,
  },
  {
    id: "legend_200",
    title: "Legend",
    description: "Ride 200 different coasters.",
    target: 200,
    current: (rides) => rides.length,
  },
  {
    id: "wood_10",
    title: "Wood devotee",
    description: "Ride 10 wooden coasters (by type).",
    target: 10,
    current: countWood,
  },
  {
    id: "steel_25",
    title: "Steel regular",
    description: "Ride 25 steel coasters (by type).",
    target: 25,
    current: countSteel,
  },
  {
    id: "hybrid_8",
    title: "Hybrid specialist",
    description: "Ride 8 hybrid coasters (by type).",
    target: 8,
    current: countHybrid,
  },
  {
    id: "inverted_3",
    title: "Inverted trio",
    description: "Ride 3 inverted coasters.",
    target: 3,
    current: (rides) => countEffectiveType(rides, "Inverted"),
  },
  {
    id: "upside_down_3",
    title: "Upside down",
    description: "Ride 3 coasters with listed inversions, or inferred from ride type when the catalog omits a count.",
    target: 3,
    current: countUpsideDownCoasters,
  },
  {
    id: "launch_3",
    title: "Launch fan",
    description: "Ride 3 launch coasters (by type).",
    target: 3,
    current: (rides) => countEffectiveType(rides, "Launch"),
  },
  {
    id: "vekoma_3",
    title: "Vekoma trio",
    description: "Ride 3 Vekoma coasters.",
    target: 3,
    current: (rides) => countManufacturer(rides, isVekoma),
  },
  {
    id: "mack_3",
    title: "Mack trio",
    description: "Ride 3 Mack Rides coasters.",
    target: 3,
    current: (rides) => countManufacturer(rides, isMackRides),
  },
  {
    id: "rmc_3",
    title: "RMC trio",
    description: "Ride 3 Rocky Mountain Construction coasters.",
    target: 3,
    current: (rides) => countManufacturer(rides, isRockyMountain),
  },
  {
    id: "gerstlauer_3",
    title: "Gerstlauer trio",
    description: "Ride 3 Gerstlauer coasters.",
    target: 3,
    current: (rides) => countManufacturer(rides, isGerstlauer),
  },
  {
    id: "premier_3",
    title: "Premier trio",
    description: "Ride 3 Premier Rides coasters.",
    target: 3,
    current: (rides) => countManufacturer(rides, isPremierRides),
  },
  {
    id: "arrow_ss_3",
    title: "Classic steel",
    description: "Ride 3 coasters by Arrow Dynamics or S&S Sansei",
    target: 3,
    current: (rides) => countManufacturer(rides, isArrowOrSS),
  },
  {
    id: "parks_2",
    title: "Two parks",
    description: "Ride coasters at 2 different parks.",
    target: 2,
    current: distinctParks,
  },
  {
    id: "parks_5",
    title: "Park hopper",
    description: "Ride coasters at 5 different parks.",
    target: 5,
    current: distinctParks,
  },
  {
    id: "parks_15",
    title: "Road tripper",
    description: "Ride coasters at 15 different parks.",
    target: 15,
    current: distinctParks,
  },
  {
    id: "speed_40",
    title: "Building speed",
    description: "Ride a coaster that reaches at least 40 mph.",
    target: 40,
    current: (rides) => maxField(rides, "speed_mph"),
    dataNote: "Uses the highest listed speed among your ridden coasters with speed data.",
  },
  {
    id: "speed_60",
    title: "Fast lane",
    description: "Ride a coaster that reaches at least 60 mph.",
    target: 60,
    current: (rides) => maxField(rides, "speed_mph"),
    dataNote: "Uses the highest listed speed among your ridden coasters with speed data.",
  },
  {
    id: "speed_100",
    title: "Triple digits",
    description: "Ride a coaster that reaches at least 100 mph.",
    target: 100,
    current: (rides) => maxField(rides, "speed_mph"),
    dataNote: "Uses the highest listed speed among your ridden coasters with speed data.",
  },
  {
    id: "countries_5",
    title: "World traveler",
    description: "Ride coasters in 5 different countries.",
    target: 5,
    current: distinctCountries,
  },
  {
    id: "countries_10",
    title: "Passport stamp",
    description: "Ride coasters in 10 different countries.",
    target: 10,
    current: distinctCountries,
  },
  {
    id: "continents_3",
    title: "Intercontinental",
    description: "Ride coasters on 3 continents (by park country).",
    target: 3,
    current: distinctContinents,
    dataNote: "Continents are inferred from country names in the catalog; unmapped countries do not count.",
  },
  {
    id: "length_five_miles",
    title: "Five-mile track",
    description: "Ride at least 26,400 ft of track in total (five miles, sum of credited coasters).",
    target: 26400,
    current: (rides) => sumField(rides, "length_ft"),
    dataNote: "Sums length only for coasters with length data.",
  },
  {
    id: "length_to_karman",
    title: "Edge of space",
    description: "Ride enough total track length to reach the Karman line (100 km).",
    target: KARMAN_LINE_FT,
    current: (rides) => sumField(rides, "length_ft"),
    dataNote: "Sums length only for coasters with length data.",
  },
  {
    id: "duration_two_hours",
    title: "Double feature",
    description: "Spend at least 2 hours of ride time in total (sum of track durations).",
    target: 7200,
    current: (rides) => sumField(rides, "duration_s"),
    dataNote: "Sums duration only for coasters with duration data.",
  },
  {
    id: "inversions_sum_500",
    title: "Inversion marathon",
    description: "Accumulate 500 total inversions across your ridden coasters (counts each coaster once).",
    target: 500,
    current: (rides) => sumField(rides, "inversions"),
    dataNote:
      "Uses catalog inversion counts when present; if missing, inverting ride types count as 1 toward the total.",
  },
  {
    id: "single_coaster_10_inversions",
    title: "Ten-looper",
    description: "Ride a coaster with at least 10 inversions.",
    target: 10,
    current: (rides) => maxField(rides, "inversions"),
    dataNote: "Uses the highest inversion count among your ridden coasters.",
  },
  {
    id: "height_300",
    title: "Giga guest",
    description: "Ride a coaster at least 300 ft tall.",
    target: 300,
    current: (rides) => maxField(rides, "height_ft"),
    dataNote: "Uses the tallest height among your ridden coasters with height data.",
  },
];

/**
 * Evaluate all achievements from deduplicated-by-coaster ride rows.
 * `current` is the raw metric (may exceed `target`); UI can clamp the progress bar.
 */
function ridesWithCatalogFixes(rides: AchievementRide[]): AchievementRide[] {
  return rides.map((r) => ({
    ...r,
    coasters: r.coasters ? applyCoasterKnownFixes(r.coasters) : null,
  }));
}

export function evaluateAchievements(
  uniqueRides: AchievementRide[],
  metrics: AchievementMetrics = DEFAULT_METRICS,
): AchievementEval[] {
  const rides = ridesWithCatalogFixes(uniqueRides);
  return DEFINITIONS.map((d) => {
    const raw = d.current(rides, metrics);
    const current = Math.max(0, raw);
    const unlocked = current >= d.target;
    return {
      id: d.id,
      title: stripAchievementDisplayText(d.title),
      description: stripAchievementDisplayText(d.description),
      dataNote: d.dataNote ? stripAchievementDisplayText(d.dataNote) : undefined,
      target: d.target,
      current,
      unlocked,
      unlockedAt: null,
      rarity: rarityForAchievementId(d.id),
    };
  });
}

const RARITY_LABEL: Record<AchievementRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export function achievementRarityLabel(r: AchievementRarity): string {
  return RARITY_LABEL[r];
}

/** Tailwind classes for a small rarity pill (border + text + bg). */
export function achievementRarityPillClass(r: AchievementRarity): string {
  switch (r) {
    case "common":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "uncommon":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "rare":
      return "border-sky-300 bg-sky-50 text-sky-900";
    case "epic":
      return "border-violet-300 bg-violet-100 text-violet-950";
    case "legendary":
      return "border-amber-400 bg-amber-100 text-amber-950 ring-1 ring-amber-400/40";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function unlockTimestampsByAchievementId(chronological: AchievementRide[]): Map<string, string> {
  const first = new Map<string, string>();
  for (let i = 1; i <= chronological.length; i++) {
    const subset = chronological.slice(0, i);
    const batch = evaluateAchievements(subset);
    const mark = chronological[i - 1]!.ridden_at;
    if (!mark) continue;
    for (const e of batch) {
      if (e.unlocked && !first.has(e.id)) first.set(e.id, mark);
    }
  }
  return first;
}

/** Full metrics from all credits, plus `unlockedAt` from chronological simulation when `ridden_at` is present. */
export function evaluateAchievementsWithUnlockTimes(
  rides: AchievementRide[],
  metrics: AchievementMetrics = DEFAULT_METRICS,
): AchievementEval[] {
  const chronological = ridesChronologicalUnique(rides);
  const evals = evaluateAchievements(chronological, metrics);
  const ts = unlockTimestampsByAchievementId(chronological);
  const friendUnlockIndexById: Partial<Record<string, number>> = {
    friends_1: 0,
    friends_5: 4,
    friends_10: 9,
  };
  const friendUnlockTimes = metrics.friendAcceptedAt;
  return evals.map((e) => ({
    ...e,
    unlockedAt: (() => {
      if (!e.unlocked) return null;
      const rideDerived = ts.get(e.id);
      if (rideDerived) return rideDerived;
      const friendIndex = friendUnlockIndexById[e.id];
      if (friendIndex == null) return null;
      return friendUnlockTimes[friendIndex] ?? null;
    })(),
  }));
}

export type AchievementVisibilityFilter = "all" | "unlocked" | "locked";

export type AchievementListSort =
  | "unlocked-first"
  | "locked-first"
  | "unlock-newest"
  | "unlock-oldest"
  | "alpha"
  | "rarity-desc"
  | "rarity-asc";

function achievementUnlockTimeMs(e: AchievementEval): number {
  if (!e.unlockedAt) return e.unlocked ? Number.MAX_SAFE_INTEGER : 0;
  const t = new Date(e.unlockedAt).getTime();
  return Number.isFinite(t) ? t : e.unlocked ? Number.MAX_SAFE_INTEGER : 0;
}

function progressRatio(e: AchievementEval): number {
  if (e.target > 0) return Math.min(1, e.current / e.target);
  return e.unlocked ? 1 : 0;
}

export function filterAndSortAchievements(
  evals: AchievementEval[],
  filter: AchievementVisibilityFilter,
  sort: AchievementListSort,
): AchievementEval[] {
  let list = evals;
  if (filter === "locked") list = list.filter((e) => !e.unlocked);
  else if (filter === "unlocked") list = list.filter((e) => e.unlocked);

  return [...list].sort((a, b) => {
    if (sort === "alpha") return a.title.localeCompare(b.title);

    if (sort === "rarity-desc" || sort === "rarity-asc") {
      const ka = RARITY_SORT_KEY[a.rarity];
      const kb = RARITY_SORT_KEY[b.rarity];
      const primary = sort === "rarity-desc" ? kb - ka : ka - kb;
      if (primary !== 0) return primary;
      return a.title.localeCompare(b.title);
    }

    if (sort === "locked-first") {
      if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
      if (!a.unlocked && !b.unlocked) {
        const d = progressRatio(b) - progressRatio(a);
        if (d !== 0) return d;
      }
      if (a.unlocked && b.unlocked) {
        const d = achievementUnlockTimeMs(b) - achievementUnlockTimeMs(a);
        if (d !== 0) return d;
      }
      return a.title.localeCompare(b.title);
    }

    if (sort === "unlock-newest") {
      if (a.unlocked && b.unlocked) {
        const d = achievementUnlockTimeMs(b) - achievementUnlockTimeMs(a);
        if (d !== 0) return d;
      }
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (!a.unlocked && !b.unlocked) {
        const d2 = progressRatio(b) - progressRatio(a);
        if (d2 !== 0) return d2;
      }
      return a.title.localeCompare(b.title);
    }

    if (sort === "unlock-oldest") {
      if (a.unlocked && b.unlocked) {
        const d = achievementUnlockTimeMs(a) - achievementUnlockTimeMs(b);
        if (d !== 0) return d;
      }
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (!a.unlocked && !b.unlocked) {
        const d2 = progressRatio(b) - progressRatio(a);
        if (d2 !== 0) return d2;
      }
      return a.title.localeCompare(b.title);
    }

    // unlocked-first (default)
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked && b.unlocked) {
      const d = achievementUnlockTimeMs(b) - achievementUnlockTimeMs(a);
      if (d !== 0) return d;
    }
    if (!a.unlocked && !b.unlocked) {
      const d2 = progressRatio(b) - progressRatio(a);
      if (d2 !== 0) return d2;
    }
    return a.title.localeCompare(b.title);
  });
}

/** @deprecated Prefer `filterAndSortAchievements(evals, "all", "unlocked-first")`. */
export function sortAchievementsForDisplay(evals: AchievementEval[]): AchievementEval[] {
  return filterAndSortAchievements(evals, "all", "unlocked-first");
}

export const ACHIEVEMENT_COUNT = DEFINITIONS.length;
