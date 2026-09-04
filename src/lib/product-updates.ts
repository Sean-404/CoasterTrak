export type ProductUpdate = {
  /** Stable id; newer entries should sort after older ones lexicographically when prefixed YYYY-MM-DD. */
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  title: string;
  summary: string;
  highlights?: string[];
};

/**
 * Newest first. Prepend a new entry when you ship something worth announcing.
 * The header badge uses the first entry’s id as “latest”.
 */
export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: "2026-09-04-profiles-compare-mobile",
    date: "2026-09-04",
    title: "Richer public profiles and cleaner compare on phone",
    summary:
      "Browse public profiles with credits and favorites at a glance, and compare friends without cramped park filters on small screens.",
    highlights: [
      "Public profiles show country, credit count, fav ride, and fav park before you open Stats",
      "Friend compare park filter and park list are tighter on iPhone-sized screens",
    ],
  },
  {
    id: "2026-09-04-wrapped-all-time",
    date: "2026-09-04",
    title: "Wrapped covers every credit",
    summary:
      "All-time Wrapped uses your unique credits — no ride date required. Month and year Wrapped still need dated logs for an honest trip timeline.",
    highlights: [
      "Open Stats → Wrapped and pick All-time for the full recap",
      "Quiet month/year empty states point you to All-time instead of asking you to re-date everything",
    ],
  },
  {
    id: "2026-09-04-map-and-catalog",
    date: "2026-09-04",
    title: "Map memory and catalog polish",
    summary:
      "The Discover map restores your last camera position when you come back, and several catalog labels and park names are cleaner.",
    highlights: [
      "Map center and zoom persist across Back / Discover",
      "Disney’s Magic Kingdom naming and manufacturer pills cleaned up",
    ],
  },
];

export function latestProductUpdate(): ProductUpdate | null {
  return PRODUCT_UPDATES[0] ?? null;
}

/** True when `lastSeenId` is missing or older than the newest published update. */
export function hasUnseenProductUpdates(lastSeenId: string | null | undefined): boolean {
  const latest = latestProductUpdate();
  if (!latest) return false;
  if (!lastSeenId) return true;
  return lastSeenId !== latest.id;
}

export function formatProductUpdateDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
