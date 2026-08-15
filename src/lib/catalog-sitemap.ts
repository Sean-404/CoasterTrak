import type { Coaster, Park } from "@/types/domain";
import { coasterStatCount } from "@/lib/catalog-content";
import { isCatalogHiddenParkName } from "@/lib/park-match";

/** Keep the public sitemap small enough that Google will crawl it. */
export const SITEMAP_MAX_PARKS = 180;
export const SITEMAP_MAX_COASTERS = 320;

const PARK_BRAND_BONUSES: Array<{ pattern: RegExp; bonus: number }> = [
  { pattern: /\balton\s*towers\b/i, bonus: 120 },
  { pattern: /\bdisney/i, bonus: 100 },
  { pattern: /\buniversal\b/i, bonus: 100 },
  { pattern: /\bsix\s*flags\b/i, bonus: 90 },
  { pattern: /\beuropa[\s-]?park\b/i, bonus: 90 },
  { pattern: /\bcedar\s*point\b/i, bonus: 85 },
  { pattern: /\bthorpe\s*park\b/i, bonus: 80 },
  { pattern: /\bphantasialand\b/i, bonus: 80 },
  { pattern: /\befteling\b/i, bonus: 75 },
  { pattern: /\benergylandia\b/i, bonus: 75 },
  { pattern: /\bblackpool\b/i, bonus: 70 },
  { pattern: /\bbusch\s*gardens\b/i, bonus: 70 },
  { pattern: /\bseaworld\b/i, bonus: 65 },
  { pattern: /\blegoland\b/i, bonus: 60 },
  { pattern: /\bhershey/i, bonus: 55 },
  { pattern: /\bkings\s*(island|dominion)\b/i, bonus: 55 },
  { pattern: /\bknoebels\b/i, bonus: 50 },
  { pattern: /\bport\s*aventura\b/i, bonus: 50 },
  { pattern: /\btoverland\b/i, bonus: 45 },
  { pattern: /\bheide[\s-]?park\b/i, bonus: 45 },
];

export function parkBrandPriorityBonus(name: string): number {
  let best = 0;
  for (const entry of PARK_BRAND_BONUSES) {
    if (entry.pattern.test(name)) best = Math.max(best, entry.bonus);
  }
  return best;
}

/** Stricter than page-level “substantial”: sitemap only wants pages with real copy or full stats. */
export function isCoasterSitemapEligible(coaster: Coaster): boolean {
  const summaryLen = coaster.summary_text?.trim().length ?? 0;
  if (summaryLen >= 120) return true;
  return Boolean(coaster.image_url) && coasterStatCount(coaster) >= 4;
}

export function coasterSitemapScore(coaster: Coaster): number {
  let score = 0;
  const summaryLen = coaster.summary_text?.trim().length ?? 0;
  if (summaryLen >= 280) score += 90;
  else if (summaryLen >= 120) score += 50;
  score += coasterStatCount(coaster) * 8;
  if (coaster.image_url) score += 12;
  if (coaster.manufacturer?.trim()) score += 4;
  return score;
}

export function parkSitemapScore(parkName: string, coasters: Coaster[]): number {
  const richCount = coasters.filter(isCoasterSitemapEligible).length;
  return parkBrandPriorityBonus(parkName) + coasters.length * 6 + richCount * 12;
}

function isParkSitemapEligible(parkName: string, coasters: Coaster[]): boolean {
  if (isCatalogHiddenParkName(parkName)) return false;
  if (coasters.length >= 4) return true;
  return parkBrandPriorityBonus(parkName) >= 50 && coasters.length >= 2;
}

function groupCoastersByParkId(coasters: Coaster[]): Map<number, Coaster[]> {
  const byPark = new Map<number, Coaster[]>();
  for (const coaster of coasters) {
    const list = byPark.get(coaster.park_id);
    if (list) list.push(coaster);
    else byPark.set(coaster.park_id, [coaster]);
  }
  return byPark;
}

function compareByScoreThenName(
  scoreA: number,
  nameA: string,
  scoreB: number,
  nameB: string,
): number {
  if (scoreB !== scoreA) return scoreB - scoreA;
  return nameA.localeCompare(nameB);
}

export function selectSitemapParks(
  parks: Park[],
  coasters: Coaster[],
  limit = SITEMAP_MAX_PARKS,
): Pick<Park, "id" | "name">[] {
  const byPark = groupCoastersByParkId(coasters);
  return parks
    .map((park) => {
      const rides = byPark.get(park.id) ?? [];
      return {
        id: park.id,
        name: park.name,
        rides,
        score: parkSitemapScore(park.name, rides),
      };
    })
    .filter((row) => isParkSitemapEligible(row.name, row.rides))
    .sort((a, b) => compareByScoreThenName(a.score, a.name, b.score, b.name))
    .slice(0, limit)
    .map(({ id, name }) => ({ id, name }));
}

export function selectSitemapCoasters(
  coasters: Coaster[],
  opts?: { parkIds?: Set<number>; limit?: number },
): Pick<Coaster, "id" | "name">[] {
  const limit = opts?.limit ?? SITEMAP_MAX_COASTERS;
  const parkIds = opts?.parkIds;
  const eligible = coasters.filter(isCoasterSitemapEligible);
  const preferred = parkIds ? eligible.filter((c) => parkIds.has(c.park_id)) : eligible;
  const remainder = parkIds ? eligible.filter((c) => !parkIds.has(c.park_id)) : [];

  const rank = (rows: Coaster[]) =>
    [...rows].sort((a, b) =>
      compareByScoreThenName(coasterSitemapScore(a), a.name, coasterSitemapScore(b), b.name),
    );

  return [...rank(preferred), ...rank(remainder)].slice(0, limit).map(({ id, name }) => ({ id, name }));
}
