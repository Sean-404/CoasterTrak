import type { ThemeParksDestination } from "@/lib/themeparks-wiki";
import { buildAliasLookup, type AliasLookup } from "@/lib/data-platform/coaster-aliases";
import {
  autoMatchAllCatalogParks,
  type ParkAutoMatchResult,
} from "@/lib/data-platform/park-auto-match";
import {
  buildThemeParksMatchReport,
  matchParkCoastersToThemeParks,
  type CatalogCoasterRow,
  type CatalogParkRow,
  type ParkMatchResult,
  type ThemeParksMatchReport,
} from "@/lib/data-platform/themeparks-match";
import {
  fetchThemeParksDestinations,
  fetchThemeParksParkChildren,
  themeParksAttractions,
} from "@/lib/themeparks-wiki";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

import {
  groupSnapshotByPark,
  stableSyntheticParkId,
  snapshotParkKey,
} from "../analyze/dedupe-conflicts";

export type ThemeParksSnapshotVerifyOptions = {
  rows: WikidataCoasterRow[];
  aliasLookup?: AliasLookup;
  maxParks?: number;
  delayMs?: number;
  onProgress?: (message: string) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function wikidataStatusToCatalog(status: WikidataCoasterRow["status"]): string {
  if (status === "operating") return "Operating";
  if (status === "defunct") return "Defunct";
  return "Unknown";
}

function buildSyntheticPark(
  parkKey: string,
  coasters: WikidataCoasterRow[],
): CatalogParkRow {
  const first = coasters[0]!;
  const withCoords = coasters.find((c) => c.latitude != null && c.longitude != null);
  return {
    id: stableSyntheticParkId(parkKey),
    name: first.parkLabel ?? "Unknown park",
    country: first.countryLabel,
    latitude: withCoords?.latitude ?? first.latitude,
    longitude: withCoords?.longitude ?? first.longitude,
  };
}

function toCatalogCoaster(
  row: WikidataCoasterRow,
  parkId: number,
): CatalogCoasterRow {
  return {
    id: stableSyntheticParkId(row.wikidataId),
    park_id: parkId,
    name: row.label,
    status: wikidataStatusToCatalog(row.status),
    coaster_type: row.coasterTypeLabel,
    wikidata_id: row.wikidataId,
  };
}

/** Prefer parks with the most snapshot coasters when applying --max-parks. */
export function sortParkEntriesByCoasterCount(
  entries: [string, WikidataCoasterRow[]][],
): [string, WikidataCoasterRow[]][] {
  return [...entries].sort((a, b) => {
    const countDiff = b[1].length - a[1].length;
    if (countDiff !== 0) return countDiff;
    return (a[1][0]?.parkLabel ?? "").localeCompare(b[1][0]?.parkLabel ?? "");
  });
}

export async function verifySnapshotAgainstThemeParks(
  options: ThemeParksSnapshotVerifyOptions,
): Promise<ThemeParksMatchReport> {
  const log = options.onProgress ?? (() => {});
  const aliasLookup = options.aliasLookup ?? buildAliasLookup([]);
  const delayMs = options.delayMs ?? 300;

  const byPark = groupSnapshotByPark(options.rows);
  let parkEntries = sortParkEntriesByCoasterCount([...byPark.entries()]);

  if (options.maxParks != null && options.maxParks > 0) {
    parkEntries = parkEntries.slice(0, options.maxParks);
  }

  log(`ThemeParks.wiki verify: ${parkEntries.length} parks with labels…`);
  const destinations = await fetchThemeParksDestinations();

  const catalogParks = parkEntries.map(([key, coasters]) =>
    buildSyntheticPark(key, coasters),
  );

  const { matched: parkMatches, review, unmapped } = autoMatchAllCatalogParks({
    catalogParks,
    destinations,
    existingLinks: [],
  });

  log(
    `  park auto-match: ${parkMatches.length} matched, ${review.length} review, ${unmapped.length} unmapped`,
  );

  const parkMatchById = new Map<number, ParkAutoMatchResult>(
    parkMatches.map((m) => [m.catalogPark.id, m]),
  );

  const parkResults: ParkMatchResult[] = [];

  for (const [parkKey, coasters] of parkEntries) {
    const park = buildSyntheticPark(parkKey, coasters);
    const match = parkMatchById.get(park.id);
    if (!match) continue;

    log(`  fetching attractions: ${park.name}…`);
    const children = await fetchThemeParksParkChildren(match.themeParksParkId);
    const attractions = themeParksAttractions(children.children ?? []);

    parkResults.push(
      matchParkCoastersToThemeParks({
        park,
        coasters: coasters.map((row) => toCatalogCoaster(row, park.id)),
        themeParksParkId: match.themeParksParkId,
        themeParksParkName: match.themeParksParkName,
        parkMatchMethod: match.method === "cached" ? "auto" : match.method,
        parkMatchConfidence: match.confidence,
        attractions,
        aliasLookup,
      }),
    );

    if (delayMs > 0) await sleep(delayMs);
  }

  return buildThemeParksMatchReport(parkResults, {
    auto: parkMatches.length,
    review: review.length,
    unmapped: unmapped.length,
  });
}

export type { ThemeParksDestination };
