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
import { stripThemeParksTrademarkArtifacts } from "./themeparks-match-normalize";

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

export { stripThemeParksTrademarkArtifacts };

export function themeParksAttractionMatchKey(name: string): string {
  return normalizeCoasterDedupKey(stripThemeParksTrademarkArtifacts(name));
}

export function isLikelyCoasterAttractionName(name: string): boolean {
  const n = stripThemeParksTrademarkArtifacts(name).toLowerCase();
  if (/\b(coaster|hyper|giga|launch|inverted|bobsled)/.test(n)) return true;
  if (/\b(velocicoaster|rock.?n.?roller|space mountain|big thunder)\b/.test(n)) return true;
  if (/\bmatterhorn\b/.test(n) && /\bbobsled/.test(n)) return true;
  return false;
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
  return coasterAliasKeys(name, lookup, parkId);
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
      const primary = localKeys[0] ?? "";
      if (primary.length >= 10) {
        let best: ThemeParksChildEntity | null = null;
        for (const candidate of attractions) {
          if (usedAttractionIds.has(candidate.id)) continue;
          const ck = themeParksAttractionMatchKey(candidate.name);
          if (!ck) continue;
          if (ck.startsWith(primary) || primary.startsWith(ck) || ck.includes(primary)) {
            if (!best || ck.length < themeParksAttractionMatchKey(best.name).length) {
              best = candidate;
            }
          }
        }
        if (best) {
          attr = best;
          method = "prefix";
          confidence = 0.92;
        }
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
    .map((a) => ({
      themeParksId: a.id,
      themeParksName: a.name,
      likelyCoaster: isLikelyCoasterAttractionName(a.name),
    }))
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

export function buildThemeParksMatchReport(
  parkResults: ParkMatchResult[],
  parkStats?: { auto: number; review: number; unmapped: number },
): ThemeParksMatchReport {
  let localCoasters = 0;
  let matched = 0;
  let localOnly = 0;
  let sourceAttractions = 0;
  let sourceOnlyLikelyCoaster = 0;
  let nameMismatchCandidates = 0;

  for (const p of parkResults) {
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
    parks: parkResults,
  };
}
