import { cleanCoasterName } from "@/lib/display";
import type { Coaster } from "@/types/domain";

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
  t = t.replace(/\s+\bkol\s+licznik\b\s*$/i, "").trim();
  t = t.replace(/\s+\blicznik\b\s*$/i, "").trim();
  t = t.replace(/\s+\brc\b\s*$/i, "").trim();
  return t;
}

export function normalizeCoasterDedupKey(raw: string): string {
  let s = cleanCoasterName(raw).toLowerCase();
  s = stripQueueVariantPhrases(s);
  s = s.replace(/^the\s+/i, "").trim();
  // Stylized marketing spellings → canonical word form before stripping punctuation
  s = s.replace(/\bth13teen\b/gi, "thirteen");
  s = s.replace(/\s*\(roller coaster\)\s*/gi, " ");
  s = s.replace(/\s*\(coaster\)\s*/gi, " ");
  s = s.replace(/\s*\(steel\)\s*/gi, " ");
  s = s.replace(/\s*\(wooden\)\s*/gi, " ");
  s = s.replace(/\s*\(wood\)\s*/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/[^a-z0-9]/g, "");
}

/**
 * When two rows share a dedup key, prefer the one we should show (richer stats, cleaner name).
 * `preferCoasterForDedup` returns the coaster to keep.
 */
export function preferCoasterForDedup(a: Coaster, b: Coaster): Coaster {
  const statsCount = (c: Coaster) =>
    [c.length_ft, c.speed_mph, c.height_ft, c.duration_s, c.inversions].filter((v) => v != null).length;

  const sa = statsCount(a);
  const sb = statsCount(b);
  if (sa !== sb) return sa >= sb ? a : b;

  const singleRider = (n: string) => /\bsingle\s+rider\b/i.test(n);
  if (singleRider(a.name) !== singleRider(b.name)) return singleRider(a.name) ? b : a;

  // Prefer shorter display name (usually the on-park name vs long Wikipedia title)
  if (a.name.length !== b.name.length) return a.name.length <= b.name.length ? a : b;
  return a.id <= b.id ? a : b;
}

/** Heuristic for optional “hide small rides” — conservative to avoid hiding major coasters. */
export function isLikelySmallFamilyCoaster(c: Coaster, parkName?: string | null): boolean {
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
