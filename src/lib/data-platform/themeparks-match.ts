/**
 * Match CoasterTrak catalog coasters to ThemeParks.wiki ATTRACTION entities.
 */

import { normalizeCoasterDedupKey } from "../coaster-dedup";
import type { ThemeParksChildEntity } from "../themeparks-wiki";
import {
  aliasKeyFromName,
  buildAliasLookup,
  coasterAliasKeys,
  type AliasLookup,
  type DbAliasRow,
} from "./coaster-aliases";
import {
  isLikelyCoasterAttractionName,
  stripThemeParksFeedDecorations,
  stripThemeParksTrademarkArtifacts,
  themeParksNameMatchVariants,
} from "./themeparks-match-normalize";

export type CatalogParkRow = {
  id: number;
  name: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CatalogCoasterRow = {
  id: number;
  park_id: number;
  name: string;
  status: string;
  coaster_type: string | null;
  wikidata_id: string | null;
};

export type CoasterMatchMethod = "exact_key" | "alias" | "fuzzy" | "prefix";

export type MatchedCoaster = {
  coasterId: number;
  coasterName: string;
  coasterStatus: string;
  wikidataId: string | null;
  themeParksId: string;
  themeParksName: string;
  matchMethod: CoasterMatchMethod;
  confidence: number;
};

export type UnmatchedLocalCoaster = {
  coasterId: number;
  coasterName: string;
  coasterStatus: string;
  wikidataId: string | null;
  severity: "high" | "warn" | "info";
  reason: string;
};

export type UnmatchedSourceAttraction = {
  themeParksId: string;
  themeParksName: string;
  likelyCoaster: boolean;
};

export type ParkMatchResult = {
  parkId: number;
  parkName: string;
  themeParksParkId: string;
  themeParksParkName: string;
  parkMatchMethod: "cached" | "auto" | "manual" | "seed" | "name";
  parkMatchConfidence: number;
  attractionCount: number;
  matched: MatchedCoaster[];
  localOnly: UnmatchedLocalCoaster[];
  sourceOnly: UnmatchedSourceAttraction[];
  nameMismatchCandidates: Array<{
    coasterId: number;
    coasterName: string;
    themeParksId: string;
    themeParksName: string;
    confidence: number;
  }>;
};

export type ThemeParksMatchReport = {
  generatedAt: string;
  source: "themeparks_wiki";
  parksCompared: number;
  parksAutoMatched: number;
  parksReview: number;
  parksUnmapped: number;
  totals: {
    localCoasters: number;
    matched: number;
    localOnly: number;
    sourceAttractions: number;
    sourceOnlyLikelyCoaster: number;
    nameMismatchCandidates: number;
  };
  parks: ParkMatchResult[];
};

export { buildAliasLookup, type AliasLookup, type DbAliasRow };

export { isLikelyCoasterAttractionName, stripThemeParksTrademarkArtifacts };

export function themeParksAttractionMatchKey(name: string): string {
  return normalizeCoasterDedupKey(stripThemeParksFeedDecorations(name));
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length - 1 + (b.length - 1));
}

function localOnlySeverity(status: string): UnmatchedLocalCoaster["severity"] {
  const s = status.trim().toLowerCase();
  if (s === "operating" || s === "open") return "high";
  if (s === "closed" || s === "sbno" || s === "retracking") return "warn";
  return "info";
}

function findAttractionByKeys(
  keys: string[],
  attractionByKey: Map<string, ThemeParksChildEntity>,
  usedAttractionIds: Set<string>,
): ThemeParksChildEntity | undefined {
  for (const key of keys) {
    const attr = attractionByKey.get(key);
    if (attr && !usedAttractionIds.has(attr.id)) return attr;
  }
  return undefined;
}

function keysForName(name: string, lookup: AliasLookup, parkId: number): string[] {
  const keys = new Set<string>();
  for (const variant of themeParksNameMatchVariants(name)) {
    for (const key of coasterAliasKeys(variant, lookup, parkId)) {
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

const PREFIX_MIN_LENGTH = 8;

function isPrefixOrContainmentMatch(catalogKey: string, feedKey: string): boolean {
  if (!catalogKey || !feedKey) return false;
  if (catalogKey === feedKey) return true;
  const shorter = catalogKey.length <= feedKey.length ? catalogKey : feedKey;
  const longer = catalogKey.length <= feedKey.length ? feedKey : catalogKey;
  if (shorter.length < PREFIX_MIN_LENGTH) return false;
  return longer.startsWith(shorter) || longer.includes(shorter);
}

export function matchParkCoastersToThemeParks(opts: {
  park: CatalogParkRow;
  coasters: CatalogCoasterRow[];
  themeParksParkId: string;
  themeParksParkName: string;
  parkMatchMethod: ParkMatchResult["parkMatchMethod"];
  parkMatchConfidence?: number;
  attractions: ThemeParksChildEntity[];
  aliasLookup: AliasLookup;
}): ParkMatchResult {
  const {
    park,
    coasters,
    themeParksParkId,
    themeParksParkName,
    parkMatchMethod,
    parkMatchConfidence = 1,
    attractions,
    aliasLookup,
  } = opts;

  const attractionByKey = new Map<string, ThemeParksChildEntity>();
  for (const attr of attractions) {
    for (const key of keysForName(attr.name, aliasLookup, park.id)) {
      if (!key) continue;
      if (!attractionByKey.has(key)) attractionByKey.set(key, attr);
    }
  }

  const matched: MatchedCoaster[] = [];
  const localOnly: UnmatchedLocalCoaster[] = [];
  const nameMismatchCandidates: ParkMatchResult["nameMismatchCandidates"] = [];
  const usedAttractionIds = new Set<string>();
  const usedAttractionKeys = new Set<string>();

  const orderedCoasters = [...coasters].sort((a, b) => {
    const rank = (status: string) => {
      const s = status.trim().toLowerCase();
      if (s === "operating" || s === "open") return 0;
      if (s === "unknown") return 1;
      return 2;
    };
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return a.id - b.id;
  });

  for (const coaster of orderedCoasters) {
    const localKeys = keysForName(coaster.name, aliasLookup, park.id);
    let attr = findAttractionByKeys(localKeys, attractionByKey, usedAttractionIds);
    let method: CoasterMatchMethod =
      attr && localKeys[0] && themeParksAttractionMatchKey(attr.name) === localKeys[0]
        ? "exact_key"
        : "alias";
    let confidence = 1;

    if (!attr) {
      let best: ThemeParksChildEntity | null = null;
      for (const candidate of attractions) {
        if (usedAttractionIds.has(candidate.id)) continue;
        const ck = themeParksAttractionMatchKey(candidate.name);
        if (!ck) continue;
        const hit = localKeys.some((lk) => isPrefixOrContainmentMatch(lk, ck));
        if (!hit) continue;
        if (!best || ck.length < themeParksAttractionMatchKey(best.name).length) {
          best = candidate;
        }
      }
      if (best) {
        attr = best;
        method = "prefix";
        confidence = 0.92;
      }
    }

    if (!attr) {
      let best: ThemeParksChildEntity | null = null;
      let bestScore = 0;
      const primary = localKeys[0] ?? "";
      for (const candidate of attractions) {
        if (usedAttractionIds.has(candidate.id)) continue;
        for (const lk of localKeys) {
          const score = diceCoefficient(lk || primary, themeParksAttractionMatchKey(candidate.name));
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
      }
      if (best && bestScore >= 0.86) {
        attr = best;
        method = "fuzzy";
        confidence = Number(bestScore.toFixed(3));
      }
    }

    if (attr && !usedAttractionIds.has(attr.id)) {
      usedAttractionIds.add(attr.id);
      for (const key of keysForName(attr.name, aliasLookup, park.id)) usedAttractionKeys.add(key);
      for (const key of localKeys) usedAttractionKeys.add(key);
      const matchRow: MatchedCoaster = {
        coasterId: coaster.id,
        coasterName: coaster.name,
        coasterStatus: coaster.status,
        wikidataId: coaster.wikidata_id,
        themeParksId: attr.id,
        themeParksName: attr.name,
        matchMethod: method,
        confidence,
      };
      matched.push(matchRow);

      const catalogKey = aliasKeyFromName(coaster.name);
      const feedKey = themeParksAttractionMatchKey(attr.name);
      if (
        method !== "exact_key" &&
        catalogKey !== feedKey &&
        aliasKeyFromName(attr.name) !== catalogKey
      ) {
        nameMismatchCandidates.push({
          coasterId: coaster.id,
          coasterName: coaster.name,
          themeParksId: attr.id,
          themeParksName: attr.name,
          confidence,
        });
      }
      continue;
    }

    localOnly.push({
      coasterId: coaster.id,
      coasterName: coaster.name,
      coasterStatus: coaster.status,
      wikidataId: coaster.wikidata_id,
      severity: localOnlySeverity(coaster.status),
      reason: "No ThemeParks.wiki ATTRACTION matched",
    });
  }

  const sourceOnly: UnmatchedSourceAttraction[] = attractions
    .filter((a) => !usedAttractionIds.has(a.id))
    .map((a) => {
      const keys = keysForName(a.name, aliasLookup, park.id);
      const duplicateOfMatched = keys.some((k) => usedAttractionKeys.has(k));
      return {
        themeParksId: a.id,
        themeParksName: a.name,
        likelyCoaster: !duplicateOfMatched && isLikelyCoasterAttractionName(a.name),
      };
    })
    .sort(
      (a, b) =>
        Number(b.likelyCoaster) - Number(a.likelyCoaster) ||
        a.themeParksName.localeCompare(b.themeParksName),
    );

  return {
    parkId: park.id,
    parkName: park.name,
    themeParksParkId,
    themeParksParkName,
    parkMatchMethod,
    parkMatchConfidence,
    attractionCount: attractions.length,
    matched,
    localOnly,
    sourceOnly,
    nameMismatchCandidates,
  };
}

/**
 * ThemeParks sometimes repeats the same attraction UUID on the wrong park.
 * Drop those from source-only so the admin queue does not ask us to add Crush's
 * Coaster to Adventure World, Pipeline to every SeaWorld, etc.
 */
export function suppressLeakedThemeParksAttractions(parks: ParkMatchResult[]): ParkMatchResult[] {
  const parksByAttractionId = new Map<string, Set<number>>();
  const matchedIds = new Set<string>();

  const remember = (id: string, parkId: number) => {
    const set = parksByAttractionId.get(id) ?? new Set<number>();
    set.add(parkId);
    parksByAttractionId.set(id, set);
  };

  for (const park of parks) {
    for (const row of park.matched) {
      matchedIds.add(row.themeParksId);
      remember(row.themeParksId, park.parkId);
    }
    for (const row of park.sourceOnly) {
      remember(row.themeParksId, park.parkId);
    }
  }

  return parks.map((park) => ({
    ...park,
    sourceOnly: park.sourceOnly.filter((row) => {
      if (matchedIds.has(row.themeParksId)) return false;
      return (parksByAttractionId.get(row.themeParksId)?.size ?? 0) <= 1;
    }),
  }));
}

export function buildThemeParksMatchReport(
  parkResults: ParkMatchResult[],
  parkStats?: { auto: number; review: number; unmapped: number },
): ThemeParksMatchReport {
  const parks = suppressLeakedThemeParksAttractions(parkResults);
  let localCoasters = 0;
  let matched = 0;
  let localOnly = 0;
  let sourceAttractions = 0;
  let sourceOnlyLikelyCoaster = 0;
  let nameMismatchCandidates = 0;

  for (const p of parks) {
    localCoasters += p.matched.length + p.localOnly.length;
    matched += p.matched.length;
    localOnly += p.localOnly.length;
    sourceAttractions += p.attractionCount;
    sourceOnlyLikelyCoaster += p.sourceOnly.filter((s) => s.likelyCoaster).length;
    nameMismatchCandidates += p.nameMismatchCandidates.length;
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "themeparks_wiki",
    parksCompared: parkResults.length,
    parksAutoMatched: parkStats?.auto ?? parkResults.length,
    parksReview: parkStats?.review ?? 0,
    parksUnmapped: parkStats?.unmapped ?? 0,
    totals: {
      localCoasters,
      matched,
      localOnly,
      sourceAttractions,
      sourceOnlyLikelyCoaster,
      nameMismatchCandidates,
    },
    parks,
  };
}
