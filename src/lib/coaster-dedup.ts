import { cleanCoasterName } from "@/lib/display";
import type { Coaster } from "@/types/domain";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";

/**
 * Normalizes coaster names so alternate spellings of the same ride collapse in the map UI
 * (e.g. "The Big One" vs "Big One", "TH13TEEN" vs "Thirteen").
 */
/** Same ride, different queue-line suffixes on the name (strip before alphanumeric key). */
function stripQueueVariantPhrases(s: string): string {
  let t = s;
  t = t.replace(/^(?:fast\s*pass|fastpass)\s+/i, "").trim();
  t = t.replace(/\s*[-–—]\s*single rider\s*$/i, "").trim();
  t = t.replace(/\s+single rider\s*$/i, "").trim();
  t = t.replace(/\s*\(single rider\)\s*$/i, "").trim();
  t = t.replace(/\s*[-–—]\s*standby(\s+only)?\s*$/i, "").trim();
  t = t.replace(/\s*[-–—]\s*lightning\s+lane\s*$/i, "").trim();
  t = t.replace(/\s*[-–—]\s*rider\s+switch\s*$/i, "").trim();
  // Energylandia / Polish ops feeds: "Kol Licznik", bare "Licznik", truncated "Licz"
  t = t.replace(/\s+\bkol\s+licznik\b\s*$/i, "").trim();
  t = t.replace(/\s+\blicznik\b\s*$/i, "").trim();
  t = t.replace(/\s+\blicz\b\s*$/i, "").trim();
  t = t.replace(/\s+\b(zew|wew)\b\s*$/i, "").trim();
  t = t.replace(/\s+\brc\b\s*$/i, "").trim();
  t = t.replace(/\s+starring\s+.+$/i, "").trim();
  t = t.replace(/\s+at\s+.+$/i, "").trim();
  // Leading queue lane numbers: "17 Teatr…"
  t = t.replace(/^\d{1,3}\s+/, "").trim();
  return t;
}

/** True when the stored label is a Fast Pass / single-rider / counter variant. */
export function isQueueLineOrCounterName(raw: string): boolean {
  const n = cleanCoasterName(raw).toLowerCase();
  if (!n) return false;
  if (/^(?:fast\s*pass|fastpass)\b/.test(n)) return true;
  if (/\bsingle\s+rider\b/.test(n)) return true;
  if (/\b(?:lightning\s+lane|rider\s+switch|standby)\b/.test(n)) return true;
  if (/\blicznik\b/.test(n) || /\blicz\b\s*$/.test(n)) return true;
  if (/\b(zew|wew)\b/.test(n) && /\b(teatr|egipt|kol)\b/.test(n)) return true;
  return false;
}

/**
 * Ops-feed counters / lane meters that are not rides (even after stripping Fast Pass).
 * e.g. "17 Teatr Coloseo Zew Licznik", "22 Egipt Wew Licznik".
 */
export function isOpsCounterOnlyName(raw: string): boolean {
  const n = cleanCoasterName(raw).toLowerCase();
  if (!n) return true;
  if (/\blicznik\b/.test(n) || /\blicz\b\s*$/.test(n)) {
    const core = stripQueueVariantPhrases(n)
      .replace(/\b(zew|wew|kol|teatr|egipt)\b/g, " ")
      .replace(/\d+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Nothing left but venue/ops words → counter row, not a coaster.
    if (core.length < 3) return true;
    if (/^(teatr|egipt)\b/.test(stripQueueVariantPhrases(n))) return true;
  }
  return false;
}

/**
 * ThemeParks / ops feed ghosts that are not real park installs
 * (e.g. "Launch Pad" queue entity that Wikipedia matched to the type article).
 */
export function isThemeParksGhostCoasterName(raw: string): boolean {
  const n = cleanCoasterName(raw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!n) return true;
  if (n === "launch pad" || n === "launchpad") return true;
  if (n === "launched roller coaster") return true;
  return false;
}

/** Strip Fast Pass / Licznik clutter for display when that row is the only surviving twin. */
export function cleanQueueVariantCoasterName(raw: string): string {
  const cleaned = cleanCoasterName(raw);
  const stripped = stripQueueVariantPhrases(cleaned).replace(/\s+/g, " ").trim();
  return stripped || cleaned;
}

/** Strip generic marketing/type suffixes so aliases collapse (e.g. "Blue Fire Megacoaster"). */
function stripGenericTypeSuffixes(s: string): string {
  let t = s;
  t = t.replace(/\s+mega\s*coaster\s*$/i, "").trim();
  t = t.replace(/\s+hyper\s*coaster\s*$/i, "").trim();
  t = t.replace(/\s+giga\s*coaster\s*$/i, "").trim();
  t = t.replace(/\s+strata\s*coaster\s*$/i, "").trim();
  t = t.replace(/\s+roller\s*coaster\s*$/i, "").trim();
  t = t.replace(/\s+coaster\s*$/i, "").trim();
  return t;
}

/** Marketing spellings that should collapse to the same catalog key. */
function foldThemedSpellings(s: string): string {
  return s.replace(/\bwilde\b/gi, "wild").replace(/\bfyre\b/gi, "fire");
}

/**
 * Map/list dedup: index the same coaster under normalized name and (when present) Wikidata id
 * so "Mayan" and "Fast Pass Mayan Kol Licznik" (Q…) collapse even if only one row has `wikidata_id`.
 */
export function coasterDedupLookupKeys(c: Coaster): string[] {
  const primary = normalizeCoasterDedupKey(c.name);
  const alias = normalizeCoasterAliasKey(c.name);
  const keySet = new Set<string>([
    `${c.park_id}:name:${primary}`,
    `${c.park_id}:name:${alias}`,
  ]);
  const wd = c.wikidata_id?.trim().toUpperCase();
  if (wd) keySet.add(`${c.park_id}:wd:${wd}`);
  return [...keySet];
}

export function coastersShareDedupBucket(a: Coaster, b: Coaster): boolean {
  if (a.park_id !== b.park_id) return false;
  const keysA = new Set(coasterDedupLookupKeys(a));
  return coasterDedupLookupKeys(b).some((k) => keysA.has(k));
}

export function normalizeCoasterDedupKey(raw: string): string {
  let s = cleanCoasterName(raw).toLowerCase();
  s = stripQueueVariantPhrases(s);
  s = s.replace(/[™®©]/g, "");
  s = s.replace(/^the\s+/i, "").trim();
  // Stylized marketing spellings → canonical word form before stripping punctuation
  s = s.replace(/\bth13teen\b/gi, "thirteen");
  // Energylandia spelling drift between Fast Pass feed and park labels
  s = s.replace(/\btofiffee\b/gi, "toffifee");
  s = foldThemedSpellings(s);
  // Universal marketing prefix on VelociCoaster
  s = s.replace(/^jurassic\s+world\s+/i, "");
  s = s.replace(/\s*\(roller coaster\)\s*/gi, " ");
  s = s.replace(/\s*\(coaster\)\s*/gi, " ");
  s = s.replace(/\s*\(steel\)\s*/gi, " ");
  s = s.replace(/\s*\(wooden\)\s*/gi, " ");
  s = s.replace(/\s*\(wood\)\s*/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/[^a-z0-9]/g, "");
}

function normalizeCoasterAliasKey(raw: string): string {
  let s = cleanCoasterName(raw).toLowerCase();
  s = stripQueueVariantPhrases(s);
  s = stripGenericTypeSuffixes(s);
  s = s.replace(/[™®©]/g, "");
  s = s.replace(/^the\s+/i, "").trim();
  s = s.replace(/\bth13teen\b/gi, "thirteen");
  s = foldThemedSpellings(s);
  s = s.replace(/^jurassic\s+world\s+/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/[^a-z0-9]/g, "");
}

/** Raw Wikidata fallback labels can be bare Q-ids (e.g. "Q137830653"). */
export function isPlaceholderCoasterName(raw: string): boolean {
  return /^q\d+$/i.test(cleanCoasterName(raw).trim());
}

function hasCoasterishType(t: string): boolean {
  return /\b(roller coaster|wood|steel|hybrid|inverted|launch|launched|flying|suspended|wing|dive|giga|hyper|strata|wild\s*mouse|mine\s*train|bobsled|spinning)\b/i.test(
    t,
  );
}

/** Exclude incident/event pages that can leak in via broad Wikidata class links. */
export function isLikelyNonRideEventName(raw: string): boolean {
  const n = cleanCoasterName(raw).toLowerCase();
  if (/\b(accident|derailment|fatality|catastrophe|tragedy|incident)\b/.test(n)) return true;
  if (/\bfunfair\s+disaster\b/.test(n)) return true;
  return /\bdisaster\b/.test(n) && /\b(funfair|park|crash|fire)\b/.test(n);
}

/** Broad "is this a coaster row at all?" gate used before thrill/family filtering. */
export function isLikelyCoasterEntry(c: Coaster, parkName?: string | null): boolean {
  if (isPlaceholderCoasterName(c.name)) return false;
  if (isLikelyNonRideEventName(c.name)) return false;
  if (isThemeParksGhostCoasterName(c.name)) return false;
  if (isOpsCounterOnlyName(c.name)) return false;
  if (c.inversions != null || c.speed_mph != null || c.height_ft != null || c.length_ft != null) return true;
  if (isLikelySmallFamilyCoaster(c, parkName)) return true;
  const t = effectiveCoasterType(c.coaster_type, c.manufacturer).toLowerCase();
  if (hasCoasterishType(t)) return true;
  // Sparse Wikidata rows often land as Unknown/Other with no quantities — keep them when
  // they still have a Wikidata id so map sheets match park pages.
  if (c.wikidata_id?.trim() && (!t || t === "unknown" || t === "other")) return true;
  // Name still clearly a coaster (e.g. "Golden Loop") with no type/stats yet.
  if (/\b(coaster|loop|hyper|giga|launch|invert|twister|cyclone|screamer)\b/i.test(cleanCoasterName(c.name))) {
    return true;
  }
  return false;
}

/**
 * When two rows share a dedup key, prefer the one we should show (richer stats, cleaner name).
 * `preferCoasterForDedup` returns the coaster to keep.
 */
export function preferCoasterForDedup(a: Coaster, b: Coaster): Coaster {
  const statsCount = (c: Coaster) =>
    [c.length_ft, c.speed_mph, c.height_ft, c.duration_s, c.inversions].filter((v) => v != null).length;

  // Always prefer the on-park ride name over Fast Pass / Licznik twins.
  const aQueue = isQueueLineOrCounterName(a.name);
  const bQueue = isQueueLineOrCounterName(b.name);
  if (aQueue !== bQueue) return aQueue ? b : a;

  const sa = statsCount(a);
  const sb = statsCount(b);
  if (sa !== sb) return sa >= sb ? a : b;

  const knownType = (c: Coaster) => {
    const t = (c.coaster_type ?? "").trim().toLowerCase();
    return Boolean(t) && t !== "unknown";
  };
  if (knownType(a) !== knownType(b)) return knownType(a) ? a : b;

  const aWd = Boolean(a.wikidata_id?.trim());
  const bWd = Boolean(b.wikidata_id?.trim());
  if (aWd !== bWd) return aWd ? a : b;

  const aHasImage = Boolean(a.image_url);
  const bHasImage = Boolean(b.image_url);
  if (aHasImage !== bHasImage) return aHasImage ? a : b;

  const singleRider = (n: string) => /\bsingle\s+rider\b/i.test(n);
  if (singleRider(a.name) !== singleRider(b.name)) return singleRider(a.name) ? b : a;

  // Prefer title case over ALL-CAPS marketing dumps
  const shouty = (n: string) => {
    const letters = n.replace(/[^a-zA-Z]/g, "");
    return letters.length >= 4 && letters === letters.toUpperCase();
  };
  if (shouty(a.name) !== shouty(b.name)) return shouty(a.name) ? b : a;

  // Prefer shorter display name (usually the on-park name vs long Wikipedia title)
  if (a.name.length !== b.name.length) return a.name.length <= b.name.length ? a : b;
  return a.id <= b.id ? a : b;
}

/**
 * Collapse same-park name variants for catalog pages
 * (e.g. "The Big One" vs sparse "Big One", Fast Pass / Licznik twins).
 */
export function dedupeCoastersForCatalog<T extends Coaster>(coasters: T[]): T[] {
  const winnerById = new Map<number, T>();
  const keyToWinnerId = new Map<string, number>();

  for (const coaster of coasters) {
    if (isOpsCounterOnlyName(coaster.name)) continue;

    const keys = coasterDedupLookupKeys(coaster);
    let matchedId: number | undefined;
    for (const key of keys) {
      const id = keyToWinnerId.get(key);
      if (id != null) {
        matchedId = id;
        break;
      }
    }

    if (matchedId == null) {
      winnerById.set(coaster.id, coaster);
      for (const key of keys) keyToWinnerId.set(key, coaster.id);
      continue;
    }

    const current = winnerById.get(matchedId)!;
    const preferred = preferCoasterForDedup(current, coaster) as T;
    if (preferred.id !== current.id) {
      winnerById.delete(current.id);
      winnerById.set(preferred.id, preferred);
    } else {
      winnerById.set(current.id, preferred);
    }

    for (const key of [...coasterDedupLookupKeys(current), ...keys]) {
      keyToWinnerId.set(key, preferred.id);
    }
  }

  const seen = new Set<number>();
  const out: T[] = [];
  for (const coaster of coasters) {
    if (isOpsCounterOnlyName(coaster.name)) continue;
    let winnerId: number | undefined;
    for (const key of coasterDedupLookupKeys(coaster)) {
      winnerId = keyToWinnerId.get(key);
      if (winnerId != null) break;
    }
    if (winnerId == null || seen.has(winnerId)) continue;
    const winner = winnerById.get(winnerId);
    if (!winner) continue;
    seen.add(winnerId);
    // If the only surviving row is still a Fast Pass / Licznik label, show the base name.
    if (isQueueLineOrCounterName(winner.name)) {
      out.push({ ...winner, name: cleanQueueVariantCoasterName(winner.name) });
    } else {
      out.push(winner);
    }
  }
  return out;
}

/** Heuristic for optional “hide small rides” — conservative to avoid hiding major coasters. */
function isLikelySmallFamilyCoaster(c: Coaster, parkName?: string | null): boolean {
  const n = cleanCoasterName(c.name).toLowerCase();
  const park = (parkName ?? "").toLowerCase();
  const blackpoolLike =
    park.includes("blackpool") || park.includes("pleasure beach");

  // Blackpool — tame family wood / bobsled that sit above generic height cutoffs.
  if (/\bnickelodeon streak\b/i.test(n)) return true;
  if (blackpoolLike && /\bavalanche\b/i.test(n)) return true;
  // Only one notable “Steeplechase” in our catalog (Blackpool horse-racing wood).
  if (/\bsteeplechase\b/i.test(n)) return true;

  if (
    /\b(big apple|ladybird|lady bug|octonauts|gallopers|blue flyer|egg\s*timer|farmyard)\b/i.test(n)
  ) {
    return true;
  }
  // Catalog names rarely say “family” in coaster_type; match on signage-style titles.
  if (
    /\b(kiddie|kiddy|children'?s|family\s+coaster|family\s+ride|junior|preschool)\b/i.test(n) ||
    /\bjr\.?\b/i.test(n)
  ) {
    return true;
  }
  // Common on-park names that don’t include “kiddie” (Mack powered, etc.).
  if (/\bflying fish\b/i.test(n)) return true;

  const h = c.height_ft;
  const len = c.length_ft;
  const spd = c.speed_mph;
  const inv = c.inversions ?? 0;

  if (h != null && len != null && h <= 48 && len <= 750) return true;
  if (h != null && h <= 45 && (len == null || len <= 900)) return true;

  // Many DB rows only have one of height / length / speed — treat obvious kiddie tiers.
  if (h != null && h <= 38) return true;
  if (spd != null && spd <= 25 && inv === 0) return true;
  if (len != null && len <= 480 && spd != null && spd <= 34 && inv === 0) return true;

  /**
   * Indoor / family “coaster” dark rides: modest height + speed, no inversions, not hyper-long.
   * (e.g. Thorpe Park “The Walking Dead: The Ride” — tall enough to miss the h≤40 ∧ len≤900 rule.)
   */
  if (
    inv === 0 &&
    h != null &&
    h <= 55 &&
    spd != null &&
    spd <= 40 &&
    (len == null || len <= 2600)
  ) {
    return true;
  }

  const t = (c.coaster_type ?? "").toLowerCase();
  if (t.includes("family") || t.includes("kiddie") || t.includes("junior") || t.includes("powered")) return true;

  return false;
}

/**
 * Classify whether a coaster is likely a thrill ride.
 * Inversions are a strong positive signal, but are never required.
 */
export function isThrillCoaster(c: Coaster, parkName?: string | null): boolean {
  const n = cleanCoasterName(c.name).toLowerCase();
  const t = effectiveCoasterType(c.coaster_type, c.manufacturer).toLowerCase();
  const speed = c.speed_mph ?? null;
  const height = c.height_ft ?? null;
  const length = c.length_ft ?? null;
  const inv = c.inversions ?? 0;

  // Strong direct signals.
  if (inv >= 1) return true;
  if (speed != null && speed >= 50) return true;
  if (height != null && height >= 120) return true;
  if (
    /\b(hyper|giga|strata|launch|launched|inverted|dive|wing|flying|floorless|suspended|x[-\s]?coaster|4d|multi[-\s]?dimension)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  // Small/family cues should suppress borderline rides.
  const familyCue =
    /\b(family|kiddie|kiddy|junior|children|powered|mine\s*train|wild\s*mouse)\b/i.test(t) ||
    /\b(kiddie|kiddy|junior|children'?s|family)\b/i.test(n);
  if (isLikelySmallFamilyCoaster(c, parkName) || familyCue) {
    return false;
  }

  // Keep likely coasters visible when the source lacks numeric intensity fields.
  // This avoids false negatives on parks where Wikidata has sparse ride stats.
  const hasQuantSignals = speed != null || height != null || length != null || inv > 0;
  if (!hasQuantSignals) {
    return true;
  }

  // Moderate but still high-intensity profile (e.g. airtime-focused wood/hybrid rides).
  if (speed != null && speed >= 42 && ((height != null && height >= 60) || (length != null && length >= 2200))) {
    return true;
  }

  // Score borderline cases with multiple moderate signals.
  let score = 0;
  if (speed != null) {
    if (speed >= 45) score += 2;
    else if (speed >= 38) score += 1;
  }
  if (height != null) {
    if (height >= 95) score += 2;
    else if (height >= 70) score += 1;
  }
  if (length != null && length >= 2800) score += 1;
  if (/\b(wood|steel|hybrid)\b/i.test(t)) score += 1;

  return score >= 3;
}
