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
