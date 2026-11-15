/**
 * Rough country hints from coordinates when a catalog country is missing or wrong.
 * Used by catalog sync and map UI so pins in India are not labeled China, etc.
 */

import { PARK_COUNTRY_BY_NAME } from "@/lib/catalog-overrides";

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
  // South Korea before Japan, but stop at the Korea Strait.
  // The old box ran to 132°E and swallowed northern Kyushu (Fukuoka, Huis Ten Bosch).
  // Tsushima is Japan at ~34.2°N 129.3°E, so exclude that island from the peninsula box.
  const inSouthKoreaBox = lat >= 33.05 && lat <= 38.7 && lng >= 124.5 && lng <= 129.55;
  const tsushima = lat >= 34.0 && lat <= 34.75 && lng >= 129.05 && lng <= 129.55;
  if (inSouthKoreaBox && !tsushima) return "South Korea";
  // Japan (main islands + Okinawa). Kept intentionally broad for park-scale pin correction.
  if ((lat >= 30 && lat <= 46 && lng >= 129 && lng <= 146) || (lat >= 24 && lat <= 31 && lng >= 122 && lng <= 132)) {
    return "Japan";
  }
  // Singapore island, kept south of the Johor Strait so Legoland Malaysia and Johor Bahru stay Malaysia.
  if (lat >= 1.15 && lng >= 103.6 && lng <= 104.1 && lat <= (lng < 103.75 ? 1.4 : 1.45)) return "Singapore";
  // Canada hints stay north of the US border. The old box (43–47.5°N, 80–57°W) also covered
  // upstate New York, Vermont, New Hampshire and Maine, and relabelled their parks as Canada.
  // Southern Quebec and eastern Ontario: the border runs along 45°N east of the St. Lawrence,
  // and the river itself lies south of 45°N further west (La Ronde, Montreal).
  if (lat > 45.02 && lat <= 47.5 && lng >= -79.5 && lng <= -71.4) return "Canada";
  // Quebec City area, west of Maine.
  if (lat >= 46.3 && lat <= 47.5 && lng > -71.4 && lng <= -70.6) return "Canada";
  // Lower mainland BC (Playland / Greater Vancouver), north of the 49th parallel.
  if (lat >= 49.0 && lat <= 49.6 && lng >= -125 && lng <= -122.5) return "Canada";
  // Germany (mainland). Lower bound lat 49.5 keeps Alsace / Europa-Park (France) out of this band.
  if (lat >= 49.5 && lat <= 55.1 && lng >= 6.5 && lng <= 15.0) return "Germany";
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
  // Universal Studios Singapore was stored as Malaysia.
  if (hint === "Singapore" && cl === "malaysia") return hint;
  // Wikidata sometimes labels German parks (e.g. Nürburgring) as France despite DE coordinates.
  if (hint === "Germany" && cl === "france") return hint;
  return c;
}

/**
 * Country to show for a park: a hand-checked override by park name when there is one
 * (catalog-overrides.ts), otherwise the stored country reconciled with its coordinates.
 * Overrides apply before the database row is repaired, so pages are right straight away.
 */
export function resolveParkCountry(park: {
  name?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  const override = park.name ? PARK_COUNTRY_BY_NAME[park.name.trim()] : undefined;
  return override ?? reconcileCountryWithCoords(park.country, park.latitude ?? null, park.longitude ?? null);
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
