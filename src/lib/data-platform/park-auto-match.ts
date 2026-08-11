/**
 * Auto-match catalog parks to ThemeParks.wiki park entities by name (+ cached DB link).
 */

import {
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
      if (isLikelyWaterParkName(park.name)) continue;
      out.push({ ...park, destinationName: dest.name });
    }
  }
  return out;
}

function scoreParkNameMatch(catalogName: string, tpName: string, destinationName: string): number {
  if (parkNamesMatch(catalogName, tpName)) return 1;
  if (parkNamesMatch(catalogName, `${tpName} ${destinationName}`)) return 0.92;
  if (parkNamesMatch(catalogName, destinationName)) return 0.78;
  return 0;
}

export function matchCatalogParkToThemeParks(opts: {
  catalogPark: ParkForMatch;
  candidates: ThemeParksParkCandidate[];
  existingLink?: ExistingParkLink | null;
}): ParkAutoMatchResult | ParkAutoMatchCandidate | null {
  const { catalogPark, candidates, existingLink } = opts;

  if (isCatalogHiddenParkName(catalogPark.name)) return null;

  if (existingLink?.external_id) {
    const hit = candidates.find((c) => c.id === existingLink.external_id);
    if (hit) {
      return {
        catalogPark,
        themeParksParkId: hit.id,
        themeParksParkName: existingLink.external_name ?? hit.name,
        destinationName: hit.destinationName,
        confidence: 1,
        method: existingLink.match_method === "manual" ? "manual" : "cached",
      };
    }
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
      method: existingLink ? "cached" : "auto",
    };
  }

  return base;
}

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

  const matched: ParkAutoMatchResult[] = [];
  const review: ParkAutoMatchCandidate[] = [];
  const unmapped: ParkForMatch[] = [];

  for (const catalogPark of opts.catalogParks) {
    if (isCatalogHiddenParkName(catalogPark.name)) continue;

    const result = matchCatalogParkToThemeParks({
      catalogPark,
      candidates,
      existingLink: linkByParkId.get(catalogPark.id) ?? null,
    });

    if (!result) {
      unmapped.push(catalogPark);
      continue;
    }

    if ("method" in result) {
      matched.push(result);
    } else {
      review.push(result);
    }
  }

  return { matched, review, unmapped };
}

export { flattenThemeParksParks };
