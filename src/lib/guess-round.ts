import { createHmac, timingSafeEqual } from "node:crypto";
import { isLikelyCoasterEntry } from "@/lib/coaster-dedup";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { sanitizeCoasterImageUrl } from "@/lib/coaster-known-fixes";
import { cleanCoasterName } from "@/lib/display";
import type { Coaster, Park } from "@/types/domain";
import { isCatalogHiddenParkName } from "@/lib/park-match";

export type GuessCandidate = {
  coasterId: number;
  coasterName: string;
  imageUrl: string;
  parkId: number;
  parkName: string;
  country: string;
  latitude: number;
  longitude: number;
};

const TOKEN_TTL_MS = 30 * 60 * 1000;

function guessTokenSecret(): string | null {
  const secret = process.env.SYNC_CRON_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return secret || null;
}

const USELESS_GUESS_PHOTO_TOKENS = new Set([
  "logo",
  "logos",
  "wordmark",
  "emblem",
  "icon",
  "icons",
  "badge",
  "crest",
  "sign",
  "signs",
  "signage",
  "marquee",
  "nameboard",
  "poster",
  "artwork",
  "illustration",
  "drawing",
  "diagram",
  "schematic",
  "pictogram",
]);

function guessPhotoTokens(url: string): string[] {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  return `${url} ${decoded}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Guess rounds need a scene you can place. Logos, title signs, and English
 * Wikipedia local files (usually non-free branding) are not that.
 */
export function isUsefulGuessPhotoUrl(url: string): boolean {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  if (/\/wikipedia\/en\//i.test(pathname)) return false;
  if (/\.svg$/i.test(pathname)) return false;
  return !guessPhotoTokens(url).some((token) => USELESS_GUESS_PHOTO_TOKENS.has(token));
}

function hasGuessableCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 85 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return false;
  return true;
}

const NON_COASTER_RIDE =
  /\b(ferris|observation\s+wheel|giant\s+wheel|sky\s*wheel|big\s+wheel|neon\s+wheel|clock|drop\s+tower|space\s+shot|star\s+flyer|sky\s*flyer|carousel|merry[- ]go[- ]round|log\s+flume|river\s+rapids|dark\s+ride|monorail|chairlift|zipline|zip\s+line|go[- ]kart|bumper\s+car)\b/i;

/** CoasterGuessr should not deal a wheel, flat ride, or other non-coaster that slipped into the catalog. */
export function isGuessPoolCoaster(coaster: Coaster): boolean {
  const name = cleanCoasterName(coaster.name);
  const type = effectiveCoasterType(coaster.coaster_type, coaster.manufacturer);
  const haystack = `${name} ${type}`;
  if (NON_COASTER_RIDE.test(haystack)) return false;
  if (/\bwheel\b/i.test(haystack) && !/\bcoaster\b/i.test(haystack)) return false;
  return isLikelyCoasterEntry(coaster);
}

export function toGuessCandidate(
  coaster: Coaster,
  park: Pick<Park, "id" | "name" | "country" | "latitude" | "longitude"> | null | undefined,
): GuessCandidate | null {
  if (!park) return null;
  if (isCatalogHiddenParkName(park.name)) return null;
  if (!hasGuessableCoords(park.latitude, park.longitude)) return null;
  if (!isGuessPoolCoaster(coaster)) return null;

  const imageUrl = sanitizeCoasterImageUrl(coaster.image_url);
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl) || !isUsefulGuessPhotoUrl(imageUrl)) return null;

  const coasterName = cleanCoasterName(coaster.name);
  if (!coasterName) return null;

  return {
    coasterId: coaster.id,
    coasterName,
    imageUrl,
    parkId: park.id,
    parkName: park.name.trim(),
    country: park.country?.trim() || "Unknown",
    latitude: park.latitude,
    longitude: park.longitude,
  };
}

export function buildGuessCandidates(
  coasters: Coaster[],
  parks: Array<Pick<Park, "id" | "name" | "country" | "latitude" | "longitude">>,
): GuessCandidate[] {
  const parkById = new Map(parks.map((park) => [park.id, park]));
  const out: GuessCandidate[] = [];
  const seen = new Set<number>();

  for (const coaster of coasters) {
    if (seen.has(coaster.id)) continue;
    const candidate = toGuessCandidate(coaster, parkById.get(coaster.park_id));
    if (!candidate) continue;
    seen.add(coaster.id);
    out.push(candidate);
  }

  return out;
}

export function pickGuessCandidate(
  candidates: GuessCandidate[],
  options?: { avoidCoasterId?: number | null; random?: () => number },
): GuessCandidate | null {
  if (!candidates.length) return null;
  const avoid = options?.avoidCoasterId;
  const pool =
    avoid != null && candidates.length > 1
      ? candidates.filter((row) => row.coasterId !== avoid)
      : candidates;
  const source = pool.length ? pool : candidates;
  const random = options?.random ?? Math.random;
  const index = Math.min(source.length - 1, Math.max(0, Math.floor(random() * source.length)));
  return source[index] ?? null;
}

export function signGuessToken(coasterId: number, now = Date.now()): string | null {
  const secret = guessTokenSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify({ c: coasterId, exp: now + TOKEN_TTL_MS }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readGuessToken(token: string, now = Date.now()): number | null {
  const secret = guessTokenSecret();
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { c?: unknown; exp?: unknown };
    if (typeof parsed.c !== "number" || !Number.isInteger(parsed.c) || parsed.c <= 0) return null;
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parsed.c;
  } catch {
    return null;
  }
}

/** GeoGuessr-style decay. Close park pins still score high; a random continent does not. */
export function guessScoreFromKm(km: number): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  if (km <= 1) return 5000;
  return Math.max(0, Math.round(5000 * Math.exp(-km / 1200)));
}

export function guessDistanceLabel(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "No guess";
  if (km < 25) return "On the park";
  if (km < 150) return "Same area";
  if (km < 800) return "Right region";
  if (km < 2500) return "Right part of the world";
  return "Long way off";
}

export function formatGuessDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 1) return "Under 1 km";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString("en-US")} km`;
}
