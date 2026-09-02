import { canonicalCountryLabel, unjamGeoLabel } from "@/lib/geo-country";

/**
 * Strip Wikipedia disambiguation suffixes from coaster names for cleaner display.
 * e.g. "Wicker Man (roller coaster)" → "Wicker Man"
 *      "Corkscrew (Alton Towers)"    → "Corkscrew"
 */
export function cleanCoasterName(name: string): string {
  return name
    .replace(/\s*\([^)]+\)\s*$/, "")
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wikipedia multi-install manufacturer cells often lose `<br>` separators when scraped,
 * producing strings like "Arrow Development (Florida)Dynamic Structures (rebuild)".
 * Also strip leftover wiki markup brackets.
 */
export function normalizeManufacturerLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = raw.replace(/[\[\]]+/g, "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.replace(/\)(?=[A-Z])/g, ") · ");
  s = s.replace(/\s*·\s*/g, " · ").trim();
  return s || null;
}

/** "Park name · Country" when country is known — disambiguates Disney/Universal and other chains. */
export function formatParkLabel(
  name: string | null | undefined,
  country: string | null | undefined,
): string {
  const n = unjamGeoLabel(name);
  const c = canonicalCountryLabel(country) || unjamGeoLabel(country);
  if (!n && !c) return "";
  if (!c) return n;
  if (!n) return c;
  return `${n} · ${c}`;
}

/** Fold text for search: strip accents (ü → u), case, and punctuation. */
function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Loose substring match for search inputs: ignores case, diacritics, apostrophes, and punctuation
 * so "nurburgring" matches "Nürburgring" and "Falcon's Flight" matches "Falcons Flight".
 */
export function matchesSearchQuery(haystack: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const needle = foldSearchText(q);
  if (!needle) return false;
  return foldSearchText(haystack).includes(needle);
}
