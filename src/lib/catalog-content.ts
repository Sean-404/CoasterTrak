import type { Coaster } from "@/types/domain";
import { cleanCoasterName } from "@/lib/display";
import { coasterLifecycle, isCoasterDefunct, isParkDefunct } from "@/lib/coaster-status";
import { fmtHeight, fmtSpeed } from "@/lib/units";

const IMPERIAL = "imperial" as const;

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

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

/**
 * Wikipedia extracts do not count as unique value. Index only when CoasterTrak has
 * its own catalog facts (photo, measurements, or a real park lineup).
 */
export function isCoasterCatalogSubstantial(coaster: Coaster): boolean {
  if (coaster.image_url) return true;
  return coasterStatCount(coaster) >= 2;
}

export function isParkCatalogSubstantial(coasters: Coaster[]): boolean {
  if (coasters.length >= 2) return true;
  return coasters.some((c) => isCoasterCatalogSubstantial(c));
}

/** Thin catalog stubs: keep them out of the index and stop passing crawl equity onward. */
export const CATALOG_THIN_ROBOTS = { index: false, follow: false } as const;

export type ParkHighlightStats = {
  operatingCount: number;
  defunctCount: number;
  /** Rows with no confirmed lifecycle status — neither operating nor defunct. */
  unconfirmedCount: number;
  isDefunctPark: boolean;
  tallest: { name: string; height: string } | null;
  fastest: { name: string; speed: string } | null;
  typeBreakdown: { type: string; count: number }[];
};

export function computeParkHighlights(coasters: Coaster[]): ParkHighlightStats {
  const lifecycles = coasters.map(coasterLifecycle);
  const defunctCount = lifecycles.filter((s) => s === "Defunct").length;
  const operatingCount = lifecycles.filter((s) => s === "Operating").length;
  const unconfirmedCount = coasters.length - defunctCount - operatingCount;
  const isDefunctPark = isParkDefunct(coasters);

  let tallest: { name: string; height: string; raw: number } | null = null;
  let fastest: { name: string; speed: string; raw: number } | null = null;

  // "Notable rides" should be rides you can still ride, unless the whole park is history.
  const notableCandidates = isDefunctPark ? coasters : coasters.filter((c) => !isCoasterDefunct(c));
  for (const c of notableCandidates) {
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
    if (t === "Unknown" || t === "Other") continue;
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const typeBreakdown = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return {
    operatingCount,
    defunctCount,
    unconfirmedCount,
    isDefunctPark,
    tallest: tallest ? { name: tallest.name, height: tallest.height } : null,
    fastest: fastest ? { name: fastest.name, speed: fastest.speed } : null,
    typeBreakdown,
  };
}

/** Unique editorial intro for park pages: CoasterTrak lineup facts, not Wikipedia. */
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

  if (!highlights.isDefunctPark) {
    const statusBits: string[] = [];
    if (highlights.operatingCount > 0) statusBits.push(`${highlights.operatingCount} as operating`);
    if (highlights.defunctCount > 0) statusBits.push(`${highlights.defunctCount} as defunct or historical`);
    if (highlights.unconfirmedCount > 0) {
      statusBits.push(`${highlights.unconfirmedCount} without a confirmed status yet`);
    }
    if (statusBits.length > 1) {
      parts.push(`It lists ${joinWithAnd(statusBits)}`);
    }
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

/** Unique editorial intro for coaster pages: CoasterTrak catalog facts, not Wikipedia. */
export function buildCoasterEditorialIntro(
  coaster: Coaster,
  parkLabel: string | null,
): string {
  const name = cleanCoasterName(coaster.name);
  const typeRaw = (coaster.coaster_type || "").trim();
  const typeLabel =
    !typeRaw || typeRaw === "Unknown" || typeRaw === "Other"
      ? "roller coaster"
      : `${typeRaw.toLowerCase()} roller coaster`;

  const parts: string[] = [];
  let lead = `${name} is a ${typeLabel}`;
  if (parkLabel) lead += ` at ${parkLabel}`;
  if (coaster.manufacturer?.trim()) lead += `, built by ${coaster.manufacturer.trim()}`;
  parts.push(lead);

  const facts: string[] = [];
  const height = fmtHeight(coaster.height_ft, IMPERIAL);
  const speed = fmtSpeed(coaster.speed_mph, IMPERIAL);
  if (height) facts.push(`${height} tall`);
  if (speed) facts.push(`top speed around ${speed}`);
  if (coaster.inversions != null) {
    facts.push(
      coaster.inversions === 0
        ? "no inversions"
        : `${coaster.inversions} inversion${coaster.inversions === 1 ? "" : "s"}`,
    );
  }
  if (facts.length > 0) parts.push(`Catalog stats list it as ${facts.join(", ")}`);

  if (coaster.status?.trim()) {
    if (isCoasterDefunct(coaster)) {
      parts.push(
        coaster.closing_year
          ? `It is listed as defunct (closed around ${coaster.closing_year})`
          : "It is listed as defunct or historical in the catalog",
      );
    } else if (coasterLifecycle(coaster) === "Operating") {
      parts.push("It is listed as operating");
    }
  }

  parts.push("Track it on CoasterTrak after you ride, or open it on the interactive map to plan a visit");
  return parts.join(". ") + ".";
}

