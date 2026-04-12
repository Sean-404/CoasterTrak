/**
 * Strip Wikipedia disambiguation suffixes from coaster names for cleaner display.
 * e.g. "Wicker Man (roller coaster)" → "Wicker Man"
 *      "Corkscrew (Alton Towers)"    → "Corkscrew"
 */
export function cleanCoasterName(name: string): string {
  return name.replace(/\s*\([^)]+\)\s*$/, "").trim();
}

/** "Park name · Country" when country is known — disambiguates Disney/Universal and other chains. */
export function formatParkLabel(
  name: string | null | undefined,
  country: string | null | undefined,
): string {
  const n = (name ?? "").trim();
  const c = (country ?? "").trim();
  if (!n && !c) return "";
  if (!c) return n;
  if (!n) return c;
  return `${n} · ${c}`;
}

/**
 * Loose substring match for search inputs: ignores case, apostrophes, and punctuation
 * so queries like "Falcon's Flight" still match stored names like "Falcons Flight".
 */
export function matchesSearchQuery(haystack: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const needle = q.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!needle) return false;
  const h = haystack.toLowerCase().replace(/[^a-z0-9]/g, "");
  return h.includes(needle);
}
