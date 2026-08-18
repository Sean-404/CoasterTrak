/**
 * Auto-match catalog parks to ThemeParks.wiki park entities by name (+ cached DB link).
 */

import {
  distinctiveParkNameTokens,
  isCatalogHiddenParkName,
  isLikelyWaterParkName,
  parkNamesMatch,
  type ParkForMatch,
} from "../park-match";
import type { ThemeParksDestination, ThemeParksDestinationPark } from "../themeparks-wiki";

export type ThemeParksParkCandidate = ThemeParksDestinationPark & {
  destinationName: string;
};

export type ParkAutoMatchResult = {
  catalogPark: ParkForMatch;
  themeParksParkId: string;
  themeParksParkName: string;
  destinationName: string;
  confidence: number;
  method: "cached" | "auto" | "manual";
};

export type ParkAutoMatchCandidate = {
  catalogPark: ParkForMatch;
  themeParksParkId: string;
  themeParksParkName: string;
  destinationName: string;
  confidence: number;
};

export type ExistingParkLink = {
  park_id: number;
  external_id: string;
  external_name: string | null;
  match_method: string;
};

const AUTO_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.72;

function flattenThemeParksParks(destinations: ThemeParksDestination[]): ThemeParksParkCandidate[] {
  const out: ThemeParksParkCandidate[] = [];
  for (const dest of destinations) {
    for (const park of dest.parks ?? []) {
      if (isLikelyWaterParkName(park.name) || isLikelyWaterParkName(dest.name)) continue;
      out.push({ ...park, destinationName: dest.name });
    }
  }
  return out;
}

function hasEither(a: string, b: string, left: RegExp, right: RegExp): boolean {
  return (left.test(a) && right.test(b)) || (right.test(a) && left.test(b));
}

/** True when two labels are different venues that share tokens like "Great America". */
export function parksHaveConflictingIdentity(a: string, b: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (hasEither(na, nb, /california/, /six\s*flags/)) return true;
  if (hasEither(na, nb, /wet['\s-]*n['\s-]*wild/, /sea\s*world/)) return true;
  return false;
}

const WEAK_PARK_TOKENS = new Set(["adventure", "great", "america"]);

function themeParksDistinctiveTokensCompatible(catalogName: string, tpName: string): boolean {
  const ta = distinctiveParkNameTokens(catalogName);
  const tb = distinctiveParkNameTokens(tpName);
  if (ta.size === 0 || tb.size === 0) return true;
  let overlap = 0;
  const shared: string[] = [];
  for (const token of ta) {
    if (tb.has(token)) {
      overlap++;
      shared.push(token);
    }
  }
  if (ta.size === tb.size && overlap === ta.size) return true;
  const smaller = Math.min(ta.size, tb.size);
  if (overlap === smaller) {
    if (smaller >= 2) return true;
    return !shared.every((token) => WEAK_PARK_TOKENS.has(token));
  }
  const union = ta.size + tb.size - overlap;
  return union > 0 && overlap / union >= 0.5;
}

function scoreParkNameMatch(catalogName: string, tpName: string, destinationName: string): number {
  if (parksHaveConflictingIdentity(catalogName, tpName)) return 0;
  if (!themeParksDistinctiveTokensCompatible(catalogName, tpName)) return 0;
  if (parkNamesMatch(catalogName, tpName)) return 1;
  const combined = `${tpName} ${destinationName}`.trim();
  if (parksHaveConflictingIdentity(catalogName, combined)) return 0;
  if (!themeParksDistinctiveTokensCompatible(catalogName, combined)) return 0;
  if (parkNamesMatch(catalogName, combined)) return 0.92;
  if (parksHaveConflictingIdentity(catalogName, destinationName)) return 0;
  if (!themeParksDistinctiveTokensCompatible(catalogName, destinationName)) return 0;
  if (parkNamesMatch(catalogName, destinationName)) return 0.78;
  return 0;
}

function cachedLinkIsUsable(
  catalogPark: ParkForMatch,
  existingLink: ExistingParkLink | null | undefined,
  candidates: ThemeParksParkCandidate[],
): ThemeParksParkCandidate | null {
  if (!existingLink?.external_id) return null;
  const hit = candidates.find((c) => c.id === existingLink.external_id);
  if (!hit) return null;
  if (isLikelyWaterParkName(hit.name) || isLikelyWaterParkName(hit.destinationName)) return null;
  if (parksHaveConflictingIdentity(catalogPark.name, hit.name)) return null;
  if (parksHaveConflictingIdentity(catalogPark.name, existingLink.external_name ?? hit.name)) {
    return null;
  }
  if (!themeParksDistinctiveTokensCompatible(catalogPark.name, hit.name)) return null;
  if (!themeParksDistinctiveTokensCompatible(catalogPark.name, existingLink.external_name ?? hit.name)) {
    return null;
  }
  return hit;
}

export function matchCatalogParkToThemeParks(opts: {
  catalogPark: ParkForMatch;
  candidates: ThemeParksParkCandidate[];
  existingLink?: ExistingParkLink | null;
}): ParkAutoMatchResult | ParkAutoMatchCandidate | null {
  const { catalogPark, candidates, existingLink } = opts;

  if (isCatalogHiddenParkName(catalogPark.name)) return null;

  const cachedHit = cachedLinkIsUsable(catalogPark, existingLink, candidates);
  if (cachedHit && existingLink) {
    return {
      catalogPark,
      themeParksParkId: cachedHit.id,
      themeParksParkName: existingLink.external_name ?? cachedHit.name,
      destinationName: cachedHit.destinationName,
      confidence: 1,
      method: existingLink.match_method === "manual" ? "manual" : "cached",
    };
  }

  let best: ThemeParksParkCandidate | null = null;
  let bestScore = 0;

  for (const tp of candidates) {
    const score = scoreParkNameMatch(catalogPark.name, tp.name, tp.destinationName);
    if (score > bestScore) {
      bestScore = score;
      best = tp;
    }
  }

  if (!best || bestScore < REVIEW_THRESHOLD) return null;

  const base = {
    catalogPark,
    themeParksParkId: best.id,
    themeParksParkName: best.name,
    destinationName: best.destinationName,
    confidence: Number(bestScore.toFixed(3)),
  };

  if (bestScore >= AUTO_THRESHOLD) {
    return {
      ...base,
      method: "auto",
    };
  }

  return base;
}

type ScoredParkPair = {
  catalogPark: ParkForMatch;
  candidate: ThemeParksParkCandidate;
  score: number;
  method: "cached" | "auto" | "manual" | "review";
};

export function autoMatchAllCatalogParks(opts: {
  catalogParks: ParkForMatch[];
  destinations: ThemeParksDestination[];
  existingLinks: ExistingParkLink[];
}): {
  matched: ParkAutoMatchResult[];
  review: ParkAutoMatchCandidate[];
  unmapped: ParkForMatch[];
} {
  const candidates = flattenThemeParksParks(opts.destinations);
  const linkByParkId = new Map(opts.existingLinks.map((l) => [l.park_id, l]));

  const scored: ScoredParkPair[] = [];

  for (const catalogPark of opts.catalogParks) {
    if (isCatalogHiddenParkName(catalogPark.name)) continue;

    const existingLink = linkByParkId.get(catalogPark.id) ?? null;
    const cachedHit = cachedLinkIsUsable(catalogPark, existingLink, candidates);
    if (cachedHit && existingLink) {
      scored.push({
        catalogPark,
        candidate: cachedHit,
        score: 1,
        method: existingLink.match_method === "manual" ? "manual" : "cached",
      });
    }

    for (const tp of candidates) {
      const score = scoreParkNameMatch(catalogPark.name, tp.name, tp.destinationName);
      if (score < REVIEW_THRESHOLD) continue;
      scored.push({
        catalogPark,
        candidate: tp,
        score,
        method: score >= AUTO_THRESHOLD ? "auto" : "review",
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aDist = Math.abs(a.catalogPark.name.length - a.candidate.name.length);
    const bDist = Math.abs(b.catalogPark.name.length - b.candidate.name.length);
    if (aDist !== bDist) return aDist - bDist;
    return a.catalogPark.id - b.catalogPark.id;
  });

  const usedCatalog = new Set<number>();
  const usedThemeParks = new Set<string>();
  const matched: ParkAutoMatchResult[] = [];
  const review: ParkAutoMatchCandidate[] = [];

  for (const row of scored) {
    if (usedCatalog.has(row.catalogPark.id) || usedThemeParks.has(row.candidate.id)) continue;
    usedCatalog.add(row.catalogPark.id);
    usedThemeParks.add(row.candidate.id);

    const base = {
      catalogPark: row.catalogPark,
      themeParksParkId: row.candidate.id,
      themeParksParkName: row.candidate.name,
      destinationName: row.candidate.destinationName,
      confidence: Number(row.score.toFixed(3)),
    };

    if (row.method === "review") {
      review.push(base);
    } else {
      matched.push({ ...base, method: row.method });
    }
  }

  const unmapped = opts.catalogParks.filter(
    (p) => !isCatalogHiddenParkName(p.name) && !usedCatalog.has(p.id),
  );

  return { matched, review, unmapped };
}

export { flattenThemeParksParks };
