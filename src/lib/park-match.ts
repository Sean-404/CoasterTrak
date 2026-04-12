/**
 * Match theme-park names across Wikidata, Queue-Times, and DB rows to avoid duplicate pins.
 */

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return Infinity;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Lowercase, strip noise words, collapse punctuation for comparison. */
export function normalizeParkNameForMatch(name: string): string {
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

export function normalizeCountryForMatch(country: string | null | undefined): string {
  const c = (country ?? "").toLowerCase().trim();
  if (!c) return "";
  return COUNTRY_ALIASES[c] ?? c;
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
  /** When set to a different Queue-Times id, this row is not a merge candidate for that park. */
  queue_times_park_id?: number | null;
};

/**
 * Link a Queue-Times park to an existing DB row: same name+location, but never steal a row
 * already tied to a different Queue-Times park id.
 */
export function findParkMatchForQueueTimes(
  candidates: ParkForMatch[],
  qtParkId: number,
  name: string,
  lat: number,
  lng: number,
  maxKm: number,
): ParkForMatch | null {
  const eligible = candidates.filter(
    (p) => p.queue_times_park_id == null || p.queue_times_park_id === qtParkId,
  );
  return findParkMatchByNameAndLocation(eligible, name, lat, lng, maxKm);
}

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
