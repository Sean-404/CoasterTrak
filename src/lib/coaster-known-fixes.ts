import type { Coaster } from "@/types/domain";
import { normalizeManufacturerLabel } from "@/lib/display";

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
  Q885702: { name: "Blue Flyer", status: "Operating" },
  // Blackpool classic wood out-and-back; inversions must stay 0 (bad imports sometimes confuse with train count)
  Q265733: { inversions: 0 },
  // DCA rethemes
  Q1026847: { name: "Incredicoaster", status: "Operating" },
  Q3327600: { name: "Goofy's Sky School", status: "Operating" },
  Q16665502: { name: "Goofy's Sky School", status: "Operating" },
  // Cedar Point rethemes
  Q1189847: { name: "Top Thrill 2", status: "Operating" },
  Q1476401: { name: "Rougarou", status: "Operating" },
  Q112689934: { name: "Mantis", status: "Defunct" },
  Q1787446: { name: "Steel Vengeance", status: "Operating" },
  Q60845759: { name: "Mean Streak", status: "Defunct" },
  // Canada's Wonderland — ThemeParks feed used DareDeviler for The Fly
  Q2880135: { name: "The Fly", status: "Operating" },
  // Canada's Wonderland Thunder Run (not Kentucky Kingdom's wood coaster)
  Q7799028: {
    height_ft: 33,
    speed_mph: 40,
    length_ft: 1080,
    duration_s: 84,
    manufacturer: "Mack Rides",
    coaster_type: "Steel",
  },
  // Enchanted Kingdom — park / ThemeParks name
  Q7572494: { name: "Space Shuttle Max", status: "Operating" },
  // Animal Kingdom / Hollywood Studios
  Q1341067: {
    name: "Expedition Everest - Legend of the Forbidden Mountain",
    status: "Operating",
  },
  Q139394198: {
    name: "Rock 'n' Roller Coaster Starring The Muppets",
    status: "Operating",
  },
  // Europa-Park
  Q477897: { name: "Blue Fire", status: "Operating" },
  Q14475699: { name: "Arthur", status: "Operating" },
  Q443680: { name: "WODAN - Timburcoaster", status: "Operating" },
  Q63196746: { name: "Eurosat - CanCan Coaster", status: "Operating" },
  Q323953: { name: "Alpine Express 'Enzian'", status: "Operating" },
  Q121359119: { name: "Voltron Nevera powered by Rimac", status: "Operating" },
  // Phantasialand
  Q319747: { name: "Crazy Bats", status: "Operating" },
  Q1497026: { name: "Gebirgsbahn", status: "Defunct" },
  Q1542448: { name: "Grand-Canyon-Bahn", status: "Defunct" },
  // Six Flags Magic Mountain
  Q677477: { name: "Colossus", status: "Defunct" },
  Q75099048: { name: "Twisted Colossus", status: "Operating" },
  Q618766: { name: "Apocalypse", status: "Operating" },
  Q674382: { name: "Scream", status: "Operating" },
  Q25223509: { name: "Wicker Man", status: "Operating", height_ft: 66 },
  // Alton Towers — Wikidata P18 still the pre-2024 retrack photo
  Q1477806: {
    name: "Nemesis Reborn",
    status: "Operating",
    image_url:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alton%20Towers%20-%20Nemesis%20Reborn%205-9-2025.jpg",
  },
  // Magic Kingdom — Wikipedia multi-park manufacturer blob wrongly attached
  Q85474505: { manufacturer: "Arrow Development" },
  // Disneyland Space Mountain — current track work / rebuild attribution
  Q11704022: { manufacturer: "Dynamic Structures" },
  // Magic Kingdom TRON — WD has length only; type is launched subclass, no P176
  Q123594444: {
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Vekoma",
    height_ft: 78,
    speed_mph: 59,
    length_ft: 3169,
    inversions: 0,
    duration_s: 60,
  },
  // Alton Towers historical
  Q3338910: { name: "Beast", status: "Defunct" },
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
  // Six Flags America — park closed 2 Nov 2025; Wikidata coords are the Maryland install
  Q839200: { status: "Defunct" },
  // Parque de la Ciudad (Buenos Aires) — Intamin racing coaster, never opened (SBNO)
  Q2518728: {
    status: "Defunct",
    coaster_type: "Steel",
    manufacturer: "Intamin",
    inversions: 0,
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
  californiascreamin: {
    name: "Incredicoaster",
    coaster_type: "Steel",
    status: "Operating",
  },
  zipperdipper: {
    name: "Blue Flyer",
    status: "Operating",
  },
  topthrilldragster: {
    name: "Top Thrill 2",
    status: "Operating",
  },
  mulhollandmadness: {
    name: "Goofy's Sky School",
    status: "Operating",
  },
  daredeviler: {
    name: "The Fly",
    status: "Operating",
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
  const manufacturer = normalizeManufacturerLabel(out.manufacturer ?? null);
  if (manufacturer !== (out.manufacturer ?? null)) {
    out = { ...out, manufacturer };
  }
  return out;
}
