import type { Coaster } from "@/types/domain";

/** Generic guard: suppress incident/disaster-style image URLs from Wikidata/Commons. */
export function isLikelyIncidentImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  const u = `${url} ${decoded}`.toLowerCase();
  return /\b(incident|disaster|derailment|collision|crash|explosion|fatal)\b/.test(u);
}

/** Use when persisting or displaying `image_url` so known-bad Commons files never stick. */
export function sanitizeCoasterImageUrl(url: string | null | undefined): string | null {
  if (url == null || url === "") return null;
  if (isLikelyIncidentImageUrl(url)) return null;
  return url;
}

/**
 * Correct catalog rows where enrichment lagged behind Wikipedia renames,
 * or a one-off bad stat slipped in. Prefer wikidata_id; use legacy names only when unambiguous.
 */
const COASTER_FIXES_BY_WIKIDATA_ID: Record<
  string,
  Partial<
    Pick<
      Coaster,
      | "name"
      | "inversions"
      | "coaster_type"
      | "status"
      | "manufacturer"
      | "image_url"
      | "height_ft"
      | "speed_mph"
      | "length_ft"
      | "duration_s"
    >
  >
> = {
  // Blackpool — rebranded from Zipper Dipper; park signage & enwiki use "Blue Flyer"
  Q885702: { name: "Blue Flyer" },
  // Blackpool classic wood out-and-back; inversions must stay 0 (bad imports sometimes confuse with train count)
  Q265733: { inversions: 0 },
  // Universal Orlando — multi-install Wikidata rows that lag on stats / park linkage
  Q3073731: {
    coaster_type: "Steel",
    status: "Operating",
    height_ft: 43,
    speed_mph: 29,
    length_ft: 1099,
    inversions: 0,
    duration_s: 66,
  },
  Q21051432: {
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Premier Rides",
    height_ft: 44,
    speed_mph: 40,
    length_ft: 2200,
    inversions: 0,
    duration_s: 180,
  },
};

/**
 * Never-built / cancelled concepts that must not appear in the live catalog
 * (and must not be re-imported from Wikidata sync/upload).
 * e.g. Skyscraper Polercoaster for Skyplex on I-Drive — not Epic Universe.
 * @see https://en.wikipedia.org/wiki/Skyscraper_(roller_coaster)
 */
const SKIP_WIKIDATA_COASTER_IDS = new Set<string>(["Q18378567"]);

export function shouldSkipWikidataCoasterId(wikidataId: string | null | undefined): boolean {
  const q = wikidataId?.trim().toUpperCase();
  return Boolean(q && SKIP_WIKIDATA_COASTER_IDS.has(q));
}

/** Name-keyed fixes when Wikidata id is missing (new parks / QT leftovers). */
const COASTER_FIXES_BY_NAME_KEY: Record<
  string,
  Partial<
    Pick<
      Coaster,
      | "name"
      | "inversions"
      | "coaster_type"
      | "status"
      | "manufacturer"
      | "height_ft"
      | "speed_mph"
      | "length_ft"
      | "duration_s"
    >
  >
> = {
  // Epic Universe — RCDB / Universal published figures (height/length often still unpublished)
  curseofthewerewolf: {
    name: "Curse of the Werewolf",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Mack Rides",
    speed_mph: 37,
    inversions: 0,
    duration_s: 130,
  },
  hiccupswinggliders: {
    name: "Hiccup's Wing Gliders",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Intamin",
    speed_mph: 45,
    inversions: 0,
  },
  hiccupwingglider: {
    name: "Hiccup's Wing Gliders",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Intamin",
    speed_mph: 45,
    inversions: 0,
  },
  minecartmadness: {
    name: "Mine-Cart Madness",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Setpoint",
    inversions: 0,
    duration_s: 180,
  },
};

function coasterNameFixKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/^the\s+/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function applyCoasterKnownFixes<
  T extends Pick<Coaster, "name"> &
    Partial<
      Pick<
        Coaster,
        | "wikidata_id"
        | "inversions"
        | "coaster_type"
        | "status"
        | "manufacturer"
        | "image_url"
        | "height_ft"
        | "speed_mph"
        | "length_ft"
        | "duration_s"
      >
    >,
>(
  c: T,
): T {
  let out: T = c;
  const q = c.wikidata_id?.trim().toUpperCase();
  if (q) {
    const byWd = COASTER_FIXES_BY_WIKIDATA_ID[q];
    if (byWd) out = { ...out, ...byWd };
  }
  const byName = COASTER_FIXES_BY_NAME_KEY[coasterNameFixKey(out.name)];
  if (byName) {
    // Fill blanks / correct type; don't overwrite richer DB values with nulls.
    out = {
      ...out,
      ...Object.fromEntries(
        Object.entries(byName).filter(([key, value]) => {
          if (value == null) return false;
          if (key === "name" || key === "coaster_type" || key === "status" || key === "manufacturer") {
            return true;
          }
          const current = out[key as keyof T];
          return current == null;
        }),
      ),
    } as T;
  }
  const cleaned = sanitizeCoasterImageUrl(out.image_url ?? null);
  if (cleaned !== out.image_url) {
    out = { ...out, image_url: cleaned };
  }
  return out;
}
