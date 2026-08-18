/** Shared ThemeParks name normalization (kept separate to avoid circular imports). */

/** Strip Universal/Disney feed trademark markers rendered as ASCII "T" or symbols. */
export function stripThemeParksTrademarkArtifacts(name: string): string {
  return name
    .replace(/[™®©]/g, "")
    .replace(/([A-Za-z])T(?=[:])/g, "$1")
    .replace(/([A-Za-z])T\b/g, "$1")
    .trim();
}

/**
 * Ops / marketing decorations ThemeParks parks put on attraction labels.
 * Keep this ThemeParks-specific so catalog display names stay untouched.
 */
export function stripThemeParksFeedDecorations(name: string): string {
  let s = name.replace(/[™®©]/g, "");
  // ASCII "T" trademarks ("VelociCoasterT"), but not English words ending in T ("Knight").
  s = s.replace(/([a-z])T(?=[:])/g, "$1").replace(/([a-z])T\b/g, "$1");
  s = s.replace(/#/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^new:\s*/i, "").trim();
  s = s.replace(/^ride it backwards\s*[-–—]\s*/i, "").trim();
  s = s.replace(/\s*[-–—]\s*currently closed(?:\s+for\s+maintenance)?\s*$/i, "").trim();
  s = s.replace(/\s*\((?:currently\s+)?closed(?:\s+for\s+maintenance)?\)\s*$/i, "").trim();
  s = s.replace(/\s*[-–—]\s*4th dimension hypercoaster\s*$/i, "").trim();
  s = s.replace(/\s*[-–—]\s*king of coasters\s*$/i, "").trim();
  s = s.replace(/\s*[-–—]\s*steepest roller coaster\s*$/i, "").trim();
  s = s.replace(/\s*[-–—]\s*the family roller coaster\s*$/i, "").trim();
  s = s.replace(/\s*[-–—]\s*(?:the\s+)?family roller coaster\s*$/i, "").trim();
  s = s.replace(/\s+free-?fly coaster\s*$/i, "").trim();
  s = s.replace(/\s+funhouse coaster\s*$/i, "").trim();
  return s.replace(/\s+/g, " ").trim();
}

function stripTrailingTypeWords(name: string): string {
  let s = name.trim();
  s = s.replace(/\s+mega\s*coaster\s*$/i, "").trim();
  s = s.replace(/\s+hyper\s*coaster\s*$/i, "").trim();
  s = s.replace(/\s+giga\s*coaster\s*$/i, "").trim();
  s = s.replace(/\s+family coaster\s*$/i, "").trim();
  s = s.replace(/\s+roller coaster\s*$/i, "").trim();
  s = s.replace(/\s+coaster\s*$/i, "").trim();
  return s;
}

/**
 * Alternate labels worth matching for a ThemeParks attraction or catalog ride.
 */
export function themeParksNameMatchVariants(name: string): string[] {
  const cleaned = stripThemeParksFeedDecorations(name);
  const variants = new Set<string>();
  if (name.trim()) variants.add(name.trim());
  if (cleaned) variants.add(cleaned);

  const withoutType = stripTrailingTypeWords(cleaned);
  if (withoutType) variants.add(withoutType);

  if (/^pepsi\s+/i.test(cleaned)) {
    variants.add(cleaned.replace(/^pepsi\s+/i, "").trim());
  }
  if (/\bgadget/i.test(cleaned)) {
    variants.add("Gadget Coaster");
    variants.add("Gadget's Go Coaster");
    variants.add("Chip 'n' Dale's Gadgetcoaster");
  }

  return [...variants].filter(Boolean);
}

export function isLikelyCoasterAttractionName(name: string): boolean {
  const n = stripThemeParksFeedDecorations(name).toLowerCase();
  if (!n) return false;
  if (/\balmost like a roller coaster\b/.test(n)) return false;
  if (/\bwater\s+coaster\b/.test(n)) return false;
  if (/\b(coaster|hyper|giga|launch|inverted|bobsled)/.test(n)) return true;
  if (/\b(velocicoaster|rock.?n.?roller|space mountain|big thunder)\b/.test(n)) return true;
  if (/\bmatterhorn\b/.test(n) && /\bbobsled/.test(n)) return true;
  return false;
}
