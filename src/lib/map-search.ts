import { cleanCoasterName, matchesSearchQuery } from "@/lib/display";

/** Fold for ranking (same rules as matchesSearchQuery). */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Higher is better. Exact name beats prefix beats substring.
 * Shorter names win ties so "Icon" ranks above a longer containing match.
 */
export function scoreMapSearchMatch(name: string, query: string): number {
  const q = fold(query);
  if (!q) return 0;
  const n = fold(cleanCoasterName(name));
  if (!n.includes(q)) return 0;
  let score = 10;
  if (n === q) score = 100;
  else if (n.startsWith(q)) score = 70;
  else if (n.includes(` ${q}`) || n.includes(q)) score = 40;
  // Prefer tighter labels when the fold match quality is equal.
  score += Math.max(0, 20 - Math.min(n.length, 20));
  return score;
}

export type MapSearchHit =
  | { kind: "park"; parkId: number; score: number; label: string }
  | { kind: "coaster"; coasterId: number; parkId: number; score: number; label: string };

export function pickBestMapSearchHit(options: {
  query: string;
  parks: { id: number; name: string }[];
  coasters: { id: number; name: string; park_id: number }[];
}): MapSearchHit | null {
  const q = options.query.trim();
  if (!q) return null;

  let bestPark: MapSearchHit | null = null;
  for (const park of options.parks) {
    if (!matchesSearchQuery(park.name, q)) continue;
    const score = scoreMapSearchMatch(park.name, q);
    if (!bestPark || score > bestPark.score) {
      bestPark = { kind: "park", parkId: park.id, score, label: park.name };
    }
  }

  let bestCoaster: MapSearchHit | null = null;
  for (const coaster of options.coasters) {
    if (!matchesSearchQuery(coaster.name, q)) continue;
    const score = scoreMapSearchMatch(coaster.name, q);
    if (!bestCoaster || score > bestCoaster.score) {
      bestCoaster = {
        kind: "coaster",
        coasterId: coaster.id,
        parkId: coaster.park_id,
        score,
        label: cleanCoasterName(coaster.name),
      };
    }
  }

  if (!bestPark && !bestCoaster) return null;
  if (!bestPark) return bestCoaster;
  if (!bestCoaster) return bestPark;
  // Prefer an exact/strong ride match over a weaker park hit (e.g. "Icon" vs a park containing it).
  if (bestCoaster.score >= bestPark.score) return bestCoaster;
  return bestPark;
}
