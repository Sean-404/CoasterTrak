/**
 * Shared Wikidata → DB field inference (coaster type, display names).
 * Used by catalog sync and the upload script.
 */

import { cleanCoasterName } from "./display";
import type { WikidataCoasterRow } from "./wikidata-coasters";

/** Manufacturers that exclusively or primarily build wooden coasters. */
const WOOD_MANUFACTURERS = new Set([
  "great coasters international",
  "gravity group",
  "the gravity group",
  "philadelphia toboggan coasters",
  "philadelphia toboggan company",
  "national amusement device",
  "custom coasters international",
  "international coasters",
  "martin & vleminckx",
  "dinn corporation",
  "prior & church",
  "run & fun",
]);

/** Manufacturers that build RMC-style hybrid (steel rail on wood/steel frame) coasters. */
const HYBRID_MANUFACTURERS = new Set(["rocky mountain construction"]);

function manufacturerImpliesType(
  mfr: string,
  phrases: Set<string>,
  minSubstringLen: number,
): boolean {
  if (phrases.has(mfr)) return true;
  for (const phrase of phrases) {
    if (phrase.length >= minSubstringLen && mfr.includes(phrase)) return true;
  }
  return false;
}

/**
 * Derive a normalised coaster_type string from the Wikidata class label
 * (e.g. "wooden roller coaster") with a manufacturer-based fallback.
 */
export function inferCoasterType(
  clsLabel: string | null | undefined,
  manufacturer: string | null | undefined,
): string | undefined {
  const cls = (clsLabel ?? "").toLowerCase();
  if (cls.includes("wooden") || cls.includes("wood")) return "Wood";
  if (cls.includes("hybrid")) return "Hybrid";
  if (cls.includes("steel")) return "Steel";
  if (cls.includes("inverted")) return "Inverted";
  if (cls.includes("launch")) return "Launch";
  if (cls.includes("flying")) return "Steel";

  const mfr = (manufacturer ?? "").toLowerCase().trim();
  if (!mfr) return undefined;
  // Common abbreviation for Great Coasters International (Queue-Times / hand edits).
  if (mfr === "gci" || mfr.startsWith("gci ") || mfr.endsWith(" gci") || mfr.includes(" gci ")) {
    return "Wood";
  }
  if (manufacturerImpliesType(mfr, WOOD_MANUFACTURERS, 8)) return "Wood";
  if (manufacturerImpliesType(mfr, HYBRID_MANUFACTURERS, 6)) return "Hybrid";
  return "Steel";
}

/**
 * Prefer stored `coaster_type` unless it is missing or "Unknown" — then infer from manufacturer.
 * Queue-Times sync often leaves "Unknown" even when manufacturer is filled from Wikidata later.
 */
export function effectiveCoasterType(
  coasterType: string | null | undefined,
  manufacturer: string | null | undefined,
): string {
  const t = (coasterType ?? "").trim();
  if (t && t !== "Unknown") return t;
  return inferCoasterType(undefined, manufacturer) ?? "Unknown";
}

/** Prefer English Wikipedia title for names that match on-park signage. */
export function wikidataInsertName(wd: WikidataCoasterRow): string {
  if (wd.enwikiTitle) return cleanCoasterName(wd.enwikiTitle);
  return wd.label;
}

export function yearFromDate(d: string | null): number | null {
  if (!d) return null;
  const y = parseInt(d.slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
}
