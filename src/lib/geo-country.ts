/**
 * Rough country hints from coordinates when a catalog country is missing or wrong.
 * Used by catalog sync and map UI so pins in India are not labeled China, etc.
 */

/** Bounding boxes are intentionally loose for park-scale use (not border disputes). */
function countryHintFromLatLng(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Hong Kong / Macau before broader Asia corrections — Wikidata often stores these as China.
  if (lat >= 22.15 && lat <= 22.6 && lng >= 113.82 && lng <= 114.5) return "Hong Kong";
  if (lat >= 22.1 && lat <= 22.26 && lng >= 113.52 && lng <= 113.63) return "Macau";
  // Taiwan (main island + Penghu) — Wikidata P17 is often China for ROC parks.
  if (lat >= 21.9 && lat <= 25.4 && lng >= 119.5 && lng <= 122.1) return "Taiwan";
  // India (mainland + usual park lat/lng bands)
  if (lat >= 6 && lat <= 37 && lng >= 68 && lng <= 97) return "India";
  // Saudi Arabia (includes Qiddiya / Six Flags Qiddiya City)
  if (lat >= 16 && lat <= 33 && lng >= 34 && lng <= 56) return "Saudi Arabia";
  // South Korea (priority before Japan because longitudes overlap in the Korea Strait).
  if (lat >= 33 && lat <= 39.6 && lng >= 124 && lng <= 132) return "South Korea";
  // Japan (main islands + Okinawa). Kept intentionally broad for park-scale pin correction.
  if ((lat >= 30 && lat <= 46 && lng >= 129 && lng <= 146) || (lat >= 24 && lat <= 31 && lng >= 122 && lng <= 132)) {
    return "Japan";
  }
  // Southern Canada — Quebec / Ontario / Maritimes (La Ronde, Canada's Wonderland corridor).
  if (lat >= 43 && lat <= 47.5 && lng >= -80 && lng <= -57) return "Canada";
  // Lower mainland BC (Playland / Greater Vancouver parks).
  if (lat >= 48 && lat <= 49.6 && lng >= -125 && lng <= -122.5) return "Canada";
  return null;
}

/**
 * Split camelCase jams from legacy CSV Location fields, e.g.
 * "GeorgiaUnited States" → "Georgia United States",
 * "Orlando, FloridaKissimmee, Florida" → "Orlando, Florida Kissimmee, Florida".
 */
export function unjamGeoLabel(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Legacy CSV sometimes stored multi-city Location blobs as park names
 * ("Orlando, FloridaKissimmee, FloridaFayetteville, GeorgiaUnited States").
 */
export function isJammedMultiLocationParkName(name: string | null | undefined): boolean {
  const raw = (name ?? "").trim();
  if (!raw) return false;
  if (!/[a-z][A-Z]/.test(raw)) return false;
  const unjammed = unjamGeoLabel(raw).toLowerCase();
  const placeHits = (
    unjammed.match(
      /\b(florida|california|georgia|texas|ohio|carolina|york|jersey|united states|u\.?s\.?a?\.?)\b/g,
    ) ?? []
  ).length;
  return placeHits >= 2 || (raw.includes(",") && placeHits >= 1);
}

/** Canonical display labels for common country aliases (U.S. → United States, etc.). */
export function canonicalCountryLabel(country: string | null | undefined): string {
  return normalizeStoredCountry(country ?? "");
}

function normalizeStoredCountry(raw: string): string {
  const withSpaces = unjamGeoLabel(raw);
  if (!withSpaces) return "";

  const compact = withSpaces.toLowerCase().replace(/[^a-z]/g, "");
  // "U.S." / "U.S.A." / "USA" / "US" → United States
  if (
    compact.includes("unitedstates") ||
    compact === "us" ||
    compact === "usa" ||
    compact === "unitedstatesofamerica"
  ) {
    return "United States";
  }
  if (compact.includes("unitedkingdom") || compact === "uk" || compact === "greatbritain") {
    return "United Kingdom";
  }
  if (compact.includes("hongkong") || compact === "hk" || compact === "hksar") {
    return "Hong Kong";
  }
  if (compact.includes("macau") || compact.includes("macao")) {
    return "Macau";
  }
  if (compact.includes("taiwan") || compact === "roc" || compact.includes("republicofchina")) {
    // Keep Taiwan distinct when Wikidata/labels use ROC-style aliases.
    if (!compact.includes("people") && !compact.startsWith("prc")) return "Taiwan";
  }
  if (compact.includes("chinesetaipei")) return "Taiwan";
  if (compact.includes("southkorea")) return "South Korea";
  if (compact.includes("northkorea")) return "North Korea";
  return withSpaces;
}

/**
 * When stored country is Unknown or clearly conflicts with coordinates, prefer the hint.
 * Currently only corrects a few high-impact mismatches (e.g. India vs wrong "China",
 * Hong Kong / Macau parks wrongly labeled China).
 */
export function reconcileCountryWithCoords(
  country: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string {
  const c = normalizeStoredCountry(country ?? "");
  const la = lat ?? 0;
  const ln = lng ?? 0;
  const hint = countryHintFromLatLng(la, ln);
  if (!hint) return c || "Unknown";

  const cl = c.toLowerCase();
  if (!c || cl === "unknown") return hint;

  const chinaLike =
    cl === "china" ||
    cl === "people's republic of china" ||
    cl === "peoples republic of china" ||
    cl === "prc" ||
    cl.includes("people's republic of china");

  // Wikidata P17 for HK/Macau/Taiwan parks is often China — keep them separate in the UI.
  if (hint === "Hong Kong" && (chinaLike || cl.includes("hong kong"))) return "Hong Kong";
  if (hint === "Macau" && (chinaLike || cl.includes("macau") || cl.includes("macao"))) return "Macau";
  if (
    hint === "Taiwan" &&
    (chinaLike || cl.includes("taiwan") || cl.includes("chinese taipei") || cl === "roc")
  ) {
    return "Taiwan";
  }

  if (hint === "India" && (chinaLike || cl === "hong kong")) return hint;
  if (hint === "South Korea" && (cl === "japan" || chinaLike || cl === "hong kong")) return hint;
  if (hint === "Japan" && (cl === "south korea" || cl === "north korea" || chinaLike || cl === "hong kong")) {
    return hint;
  }
  if (
    hint === "Canada" &&
    (cl === "united states" || cl === "usa" || cl === "us" || cl === "u.s." || cl === "u.s.a.")
  ) {
    return hint;
  }
  return c;
}

/**
 * Correct common longitude sign errors from legacy CSV / geocoder feeds.
 * - US parks sometimes store west longitudes as positive (e.g. 97 instead of -97).
 * - Eastern-hemisphere parks sometimes store east longitudes as negative (e.g. India at -73).
 */
export function normalizeParkLongitude(
  lat: number,
  lng: number,
  country?: string | null,
): number {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return lng;

  const c = (country ?? "").toLowerCase();
  const us =
    c.includes("united states") || c === "usa" || c === "us" || c.endsWith(", us");
  if (us && lat > 24 && lat < 50 && lng > 65 && lng < 130) {
    return -Math.abs(lng);
  }

  if (lng < 0) {
    const eastHint = countryHintFromLatLng(lat, Math.abs(lng));
    if (eastHint) {
      const cl = c.toLowerCase();
      const reconciledPositive = reconcileCountryWithCoords(country, lat, Math.abs(lng));
      if (reconciledPositive === eastHint || cl === eastHint.toLowerCase() || !c || cl === "unknown") {
        return Math.abs(lng);
      }
    }
  }

  return lng;
}
