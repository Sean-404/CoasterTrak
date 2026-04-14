/**
 * Match theme-park names across Wikidata and DB rows to avoid duplicate pins.
 */

import type { Coaster, Park } from "@/types/domain";
import { haversineKm } from "@/lib/geo";

/** Lowercase, strip noise words, collapse punctuation for comparison. */
function normalizeParkNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/\b(theme|amusement|family|water)\s+park\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states",
  us: "united states",
  "u.s.": "united states",
  "u.s.a.": "united states",
  uk: "united kingdom",
  uae: "united arab emirates",
};

function normalizeCountryForMatch(country: string | null | undefined): string {
  const c = (country ?? "").toLowerCase().trim();
  if (!c) return "";
  return COUNTRY_ALIASES[c] ?? c;
}

/** UK nations and crown dependencies vs "United Kingdom" in DB rows. */
function countriesCompatibleForParkMatch(
  parkCountry: string | null | undefined,
  hint: string | null | undefined,
): boolean {
  if (!hint?.trim() || !parkCountry?.trim()) return true;
  const a = normalizeCountryForMatch(parkCountry);
  const b = normalizeCountryForMatch(hint);
  if (a === b) return true;
  const ukish = new Set(["united kingdom", "england", "scotland", "wales", "northern ireland", "uk"]);
  return ukish.has(a) && ukish.has(b);
}

/**
 * When Wikidata has coordinates but no park label, attach to the closest DB park within
 * `maxKm` (same country / UK-compatible when labels exist).
 */
export function findNearestParkForCoords(
  candidates: ParkForMatch[],
  lat: number,
  lng: number,
  maxKm: number,
  countryLabel: string | null | undefined,
): ParkForMatch | null {
  let best: ParkForMatch | null = null;
  let bestD = Infinity;
  for (const p of candidates) {
    if (p.latitude == null || p.longitude == null) continue;
    if (!countriesCompatibleForParkMatch(p.country, countryLabel)) continue;
    const d = haversineKm(lat, lng, p.latitude, p.longitude);
    if (d <= maxKm && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * True if two park display names likely refer to the same venue
 * (substring / token overlap, not geographic — pair with distance checks).
 */
export function parkNamesMatch(a: string, b: string): boolean {
  const na = normalizeParkNameForMatch(a);
  const nb = normalizeParkNameForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 8 && long.includes(short)) return true;
  if (short.length >= 6 && long.length >= 10 && long.includes(short)) return true;

  const ta = new Set(na.split(" ").filter((w) => w.length > 2));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const w of ta) {
    if (tb.has(w)) overlap++;
  }
  const minSize = Math.min(ta.size, tb.size);
  return minSize >= 2 && overlap >= minSize * 0.6;
}

export type ParkForMatch = {
  id: number;
  name: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Find an existing park row that matches this name + coordinates (same complex).
 * `maxKm` caps search radius; stricter for dense areas.
 */
export function findParkMatchByNameAndLocation(
  candidates: ParkForMatch[],
  name: string,
  lat: number,
  lng: number,
  maxKm: number,
): ParkForMatch | null {
  let best: ParkForMatch | null = null;
  let bestScore = Infinity;

  for (const p of candidates) {
    if (p.latitude == null || p.longitude == null) continue;
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;

    const d = haversineKm(lat, lng, p.latitude, p.longitude);
    if (d > maxKm) continue;
    if (!parkNamesMatch(name, p.name)) continue;

    const namePenalty =
      normalizeParkNameForMatch(name) === normalizeParkNameForMatch(p.name) ? 0 : 0.15;
    const score = d + namePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best;
}

/** "Town, Region, Country" labels from Wikidata centroid fallbacks — not real park names. */
function isLikelyReverseGeocodeParkName(name: string): boolean {
  const parts = name
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const region = parts.slice(-2).join(" ").toLowerCase();
    if (
      /\b(england|scotland|wales|northern ireland|united kingdom|ireland|france|germany|spain|italy|california|florida|texas|usa|united states)\b/.test(
        region,
      )
    ) {
      return true;
    }
  }
  if (parts.length === 2) {
    const last = parts[1]!.toLowerCase();
    if (
      /^(england|scotland|wales|northern ireland|uk|united kingdom|ireland|france|germany|spain|italy|usa|united states)$/i.test(
        last.trim(),
      )
    ) {
      return true;
    }
  }
  return false;
}

/** First word of the place segment before the first comma, e.g. "Alton" from "Alton, Staffs, England". */
function firstPlaceTokenFromGeocodeLabel(name: string): string {
  const beforeComma = name.split(",")[0]?.trim().toLowerCase() ?? "";
  const alpha = beforeComma.replace(/[^a-z0-9\s]/gi, " ").trim();
  return alpha.split(/\s+/).filter(Boolean)[0] ?? "";
}

function distanceBetweenParksKm(a: Park, b: Park): number {
  if (
    a.latitude == null ||
    b.latitude == null ||
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(b.latitude)
  ) {
    return Infinity;
  }
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
}

/**
 * Merge reverse-geocode park rows into a nearby real theme park (same area, name contains
 * place token). Removes the extra map pin and lets coasters keyed to the centroid row show
 * under the resort (e.g. Wicker Man → Alton Towers).
 */
export function absorbReverseGeocodeParks(parks: Park[]): {
  parks: Park[];
  idRemap: Map<number, number>;
} {
  const idRemap = new Map<number, number>();
  const enriched = new Map<number, Park>(parks.map((p) => [p.id, { ...p }]));

  for (const geocode of parks) {
    if (idRemap.has(geocode.id)) continue;
    if (!isLikelyReverseGeocodeParkName(geocode.name)) continue;

    const token = firstPlaceTokenFromGeocodeLabel(geocode.name);
    if (token.length < 4) continue;

    let best: Park | null = null;
    let bestD = Infinity;

    for (const candidate of parks) {
      if (candidate.id === geocode.id) continue;
      if (idRemap.has(candidate.id)) continue;
      if (isLikelyReverseGeocodeParkName(candidate.name)) continue;

      const cn = candidate.name.toLowerCase();
      if (!cn.includes(token)) continue;

      const d = distanceBetweenParksKm(geocode, candidate);
      if (d > 22 || d >= bestD) continue;
      best = candidate;
      bestD = d;
    }

    if (!best) continue;

    idRemap.set(geocode.id, best.id);
  }

  const out = Array.from(enriched.values()).filter((p) => !idRemap.has(p.id));
  return { parks: out, idRemap };
}

/**
 * If a coaster still points at a park row that is not shown (e.g. absorb/remap missed),
 * attach it to the nearest visible park within `maxKm` so rides do not disappear from the map.
 */
export function snapOrphanCoastersToDisplayParks(
  coasters: Coaster[],
  displayParks: Park[],
  allParksById: Map<number, Park>,
  /** Match catalog / park-merge tolerance — large resorts can have multi-km coord drift between sources. */
  maxKm = 35,
): Coaster[] {
  const displayIds = new Set(displayParks.map((p) => p.id));

  return coasters.map((c) => {
    if (displayIds.has(c.park_id)) return c;

    const home = allParksById.get(c.park_id);
    if (
      !home ||
      home.latitude == null ||
      home.longitude == null ||
      !Number.isFinite(home.latitude) ||
      !Number.isFinite(home.longitude)
    ) {
      return c;
    }

    let best: Park | null = null;
    let bestD = Infinity;
    for (const dp of displayParks) {
      if (dp.latitude == null || dp.longitude == null) continue;
      const d = haversineKm(home.latitude, home.longitude, dp.latitude, dp.longitude);
      if (d < bestD) {
        bestD = d;
        best = dp;
      }
    }

    if (best && bestD <= maxKm) {
      return { ...c, park_id: best.id };
    }
    return c;
  });
}
