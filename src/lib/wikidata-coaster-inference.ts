/**
 * Shared Wikidata → DB field inference (coaster type, display names).
 * Used by catalog sync and the upload script.
 */

import { cleanCoasterName } from "./display";
import type { WikidataCoasterRow } from "./wikidata-coasters";

/** Manufacturers that exclusively or primarily build wooden coasters. */
export const WOOD_MANUFACTURERS = new Set([
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
export const HYBRID_MANUFACTURERS = new Set(["rocky mountain construction"]);

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

  const mfr = (manufacturer ?? "").toLowerCase();
  if (!mfr) return undefined;
  if (WOOD_MANUFACTURERS.has(mfr)) return "Wood";
  if (HYBRID_MANUFACTURERS.has(mfr)) return "Hybrid";
  return "Steel";
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
