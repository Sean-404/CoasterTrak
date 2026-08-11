import type { Coaster } from "@/types/domain";
import { cleanCoasterName } from "@/lib/display";
import { isCoasterDefunct } from "@/lib/coaster-status";

export type CoasterSortKey = "name" | "speed" | "height" | "type";
export type CoasterStatusFilter = "all" | "operating" | "defunct";

export { isCoasterDefunct } from "@/lib/coaster-status";

/** Operating / unknown first, defunct last; then by display name. */
export function compareCoastersOperatingFirst(
  a: Pick<Coaster, "name" | "status" | "closing_year">,
  b: Pick<Coaster, "name" | "status" | "closing_year">,
): number {
  const aDefunct = isCoasterDefunct(a) ? 1 : 0;
  const bDefunct = isCoasterDefunct(b) ? 1 : 0;
  if (aDefunct !== bDefunct) return aDefunct - bDefunct;
  return cleanCoasterName(a.name).localeCompare(cleanCoasterName(b.name));
}

export function filterAndSortCoasters(
  coasters: Coaster[],
  options: {
    typeFilter?: string | null;
    statusFilter?: CoasterStatusFilter;
    sort?: CoasterSortKey;
  } = {},
): Coaster[] {
  const { typeFilter = null, statusFilter = "all", sort = "name" } = options;

  let rows = [...coasters];

  if (typeFilter) {
    const want = typeFilter.toLowerCase();
    rows = rows.filter((c) => (c.coaster_type || "Unknown").toLowerCase() === want);
  }

  if (statusFilter === "operating") {
    rows = rows.filter((c) => !isCoasterDefunct(c));
  } else if (statusFilter === "defunct") {
    rows = rows.filter((c) => isCoasterDefunct(c));
  }

  const operatingFirst = statusFilter === "all";

  rows.sort((a, b) => {
    if (operatingFirst) {
      const aDefunct = isCoasterDefunct(a) ? 1 : 0;
      const bDefunct = isCoasterDefunct(b) ? 1 : 0;
      if (aDefunct !== bDefunct) return aDefunct - bDefunct;
    }

    switch (sort) {
      case "speed":
        return (b.speed_mph ?? -1) - (a.speed_mph ?? -1) || compareByName(a, b);
      case "height":
        return (b.height_ft ?? -1) - (a.height_ft ?? -1) || compareByName(a, b);
      case "type":
        return (
          (a.coaster_type || "Unknown").localeCompare(b.coaster_type || "Unknown") ||
          compareByName(a, b)
        );
      case "name":
      default:
        return compareByName(a, b);
    }
  });

  return rows;
}

function compareByName(a: Coaster, b: Coaster): number {
  return cleanCoasterName(a.name).localeCompare(cleanCoasterName(b.name));
}

export function uniqueCoasterTypes(coasters: Coaster[]): string[] {
  const types = new Set<string>();
  for (const c of coasters) {
    types.add((c.coaster_type || "Unknown").trim() || "Unknown");
  }
  return [...types].sort((a, b) => a.localeCompare(b));
}
