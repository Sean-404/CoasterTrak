/** Shared ThemeParks name normalization (kept separate to avoid circular imports). */

/** Strip Universal/Disney feed trademark markers rendered as ASCII "T" or symbols. */
export function stripThemeParksTrademarkArtifacts(name: string): string {
  return name
    .replace(/[™®©]/g, "")
    .replace(/([A-Za-z])T(?=[:])/g, "$1")
    .replace(/([A-Za-z])T\b/g, "$1")
    .trim();
}
