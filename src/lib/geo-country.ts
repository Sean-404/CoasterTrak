/**
 * Rough country hints from coordinates when CSV/Queue-Times country is missing or wrong.
 * Used by catalog sync and map UI so pins in India are not labeled China, etc.
 */

/** Bounding boxes are intentionally loose for park-scale use (not border disputes). */
function countryHintFromLatLng(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // India (mainland + usual park lat/lng bands)
  if (lat >= 6 && lat <= 37 && lng >= 68 && lng <= 97) return "India";
  // Saudi Arabia (includes Qiddiya / Six Flags Qiddiya City)
  if (lat >= 16 && lat <= 33 && lng >= 34 && lng <= 56) return "Saudi Arabia";
  return null;
}

/**
 * When stored country is Unknown or clearly conflicts with coordinates, prefer the hint.
 * Currently only corrects a few high-impact mismatches (e.g. India vs wrong "China").
 */
export function reconcileCountryWithCoords(
  country: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string {
  const c = (country ?? "").trim();
  const la = lat ?? 0;
  const ln = lng ?? 0;
  const hint = countryHintFromLatLng(la, ln);
  if (!hint) return c || "Unknown";

  const cl = c.toLowerCase();
  if (!c || cl === "unknown") return hint;

  if (hint === "India" && (cl === "china" || cl === "hong kong")) return hint;
  return c;
}
