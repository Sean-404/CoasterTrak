import type { Coaster } from "@/types/domain";

/**
 * Correct catalog rows where enrichment lagged behind Wikipedia / Queue-Times renames,
 * or a one-off bad stat slipped in. Prefer wikidata_id; use legacy names only when unambiguous.
 */
const COASTER_FIXES_BY_WIKIDATA_ID: Record<
  string,
  Partial<Pick<Coaster, "name" | "inversions" | "coaster_type" | "status" | "manufacturer">>
> = {
  // Blackpool — rebranded from Zipper Dipper; Queue-Times & enwiki use "Blue Flyer"
  Q885702: { name: "Blue Flyer" },
  // Blackpool classic wood out-and-back; inversions must stay 0 (bad imports sometimes confuse with train count)
  Q265733: { inversions: 0 },
};

export function applyCoasterKnownFixes<
  T extends Pick<Coaster, "name"> &
    Partial<
      Pick<
        Coaster,
        "wikidata_id" | "inversions" | "coaster_type" | "status" | "manufacturer"
      >
    >,
>(
  c: T,
): T {
  const q = c.wikidata_id?.trim().toUpperCase();
  if (q) {
    const byWd = COASTER_FIXES_BY_WIKIDATA_ID[q];
    if (byWd) return { ...c, ...byWd };
  }
  return c;
}
