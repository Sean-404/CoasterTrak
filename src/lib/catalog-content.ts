import type { Coaster } from "@/types/domain";
import { cleanCoasterName } from "@/lib/display";
import { isCoasterDefunct, isParkDefunct } from "@/lib/coaster-status";
import { fmtHeight, fmtSpeed } from "@/lib/units";

const IMPERIAL = "imperial" as const;

export function coasterStatCount(coaster: Coaster): number {
  let n = 0;
  if (coaster.image_url) n += 1;
  if (coaster.height_ft != null) n += 1;
  if (coaster.length_ft != null) n += 1;
  if (coaster.speed_mph != null) n += 1;
  if (coaster.inversions != null) n += 1;
  if (coaster.duration_s != null) n += 1;
  if (coaster.opening_year != null) n += 1;
  return n;
}

/** Pages with almost no unique data should not inflate the sitemap or AdSense crawl. */
export function isCoasterCatalogSubstantial(coaster: Coaster, summaryText?: string | null): boolean {
  if (summaryText?.trim()) return true;
  if (coaster.image_url) return true;
  return coasterStatCount(coaster) >= 2;
}

export function isParkCatalogSubstantial(coasters: Coaster[], summaryText?: string | null): boolean {
  if (summaryText?.trim()) return true;
  if (coasters.length >= 2) return true;
  return coasters.some((c) => isCoasterCatalogSubstantial(c));
}

export type ParkHighlightStats = {
  operatingCount: number;
  defunctCount: number;
  isDefunctPark: boolean;
  tallest: { name: string; height: string } | null;
  fastest: { name: string; speed: string } | null;
  typeBreakdown: { type: string; count: number }[];
};

export function computeParkHighlights(coasters: Coaster[]): ParkHighlightStats {
  const defunctCount = coasters.filter(isCoasterDefunct).length;
  const operatingCount = coasters.length - defunctCount;

  let tallest: { name: string; height: string; raw: number } | null = null;
  let fastest: { name: string; speed: string; raw: number } | null = null;

  for (const c of coasters) {
    if (c.height_ft != null && (!tallest || c.height_ft > tallest.raw)) {
      tallest = {
        name: cleanCoasterName(c.name),
        height: fmtHeight(c.height_ft, IMPERIAL)!,
        raw: c.height_ft,
      };
    }
    if (c.speed_mph != null && (!fastest || c.speed_mph > fastest.raw)) {
      fastest = {
        name: cleanCoasterName(c.name),
        speed: fmtSpeed(c.speed_mph, IMPERIAL)!,
        raw: c.speed_mph,
      };
    }
  }

  const typeCounts = new Map<string, number>();
  for (const c of coasters) {
    const t = (c.coaster_type || "Unknown").trim();
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const typeBreakdown = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return {
    operatingCount,
    defunctCount,
    isDefunctPark: isParkDefunct(coasters),
    tallest: tallest ? { name: tallest.name, height: tallest.height } : null,
    fastest: fastest ? { name: fastest.name, speed: fastest.speed } : null,
    typeBreakdown,
  };
}

/** Unique editorial intro for park pages when no Wikipedia summary is available. */
export function buildParkEditorialIntro(
  parkName: string,
  countryLabel: string | null,
  coasters: Coaster[],
): string {
  const highlights = computeParkHighlights(coasters);
  const parts: string[] = [];

  const location = countryLabel ? `${parkName} in ${countryLabel}` : parkName;

  if (highlights.isDefunctPark) {
    parts.push(
      `${location} is listed as a defunct or historical park in CoasterTrak — all ${coasters.length} cataloged roller coaster${coasters.length === 1 ? "" : "s"} are defunct`,
    );
  } else {
    parts.push(
      `${location} has ${coasters.length} roller coaster${coasters.length === 1 ? "" : "s"} in the CoasterTrak catalog`,
    );
  }

  if (!highlights.isDefunctPark && highlights.operatingCount > 0 && highlights.defunctCount > 0) {
    parts.push(
      `including ${highlights.operatingCount} currently listed as operating and ${highlights.defunctCount} defunct or historical`,
    );
  }

  const featureBits: string[] = [];
  if (highlights.tallest) featureBits.push(`${highlights.tallest.name} (${highlights.tallest.height} tall)`);
  if (highlights.fastest && highlights.fastest.name !== highlights.tallest?.name) {
    featureBits.push(`${highlights.fastest.name} (${highlights.fastest.speed})`);
  }
  if (featureBits.length > 0) {
    parts.push(`Notable rides include ${featureBits.join(" and ")}`);
  }

  if (highlights.typeBreakdown.length > 1) {
    const types = highlights.typeBreakdown
      .slice(0, 3)
      .map(({ type, count }) => `${count} ${type.toLowerCase()}${count === 1 ? "" : "s"}`)
      .join(", ");
    parts.push(`The lineup spans ${types}`);
  }

  parts.push(
    highlights.isDefunctPark
      ? "Browse the historical lineup below or open the location on the interactive map"
      : "Browse the full list below, track credits after your visit, or open the park on the interactive map",
  );

  return parts.join(". ") + ".";
}
