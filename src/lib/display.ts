/**
 * Strip Wikipedia disambiguation suffixes from coaster names for cleaner display.
 * e.g. "Wicker Man (roller coaster)" → "Wicker Man"
 *      "Corkscrew (Alton Towers)"    → "Corkscrew"
 */
export function cleanCoasterName(name: string): string {
  return name.replace(/\s*\([^)]+\)\s*$/, "").trim();
}
