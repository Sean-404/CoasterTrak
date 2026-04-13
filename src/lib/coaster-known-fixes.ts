import type { Coaster } from "@/types/domain";
import { normalizeNameKey } from "@/lib/wikidata-coasters";

/**
 * Correct catalog rows where enrichment lagged behind Wikipedia / Queue-Times renames,
 * or a one-off bad stat slipped in. Prefer wikidata_id; use legacy names only when unambiguous.
 */
const COASTER_FIXES_BY_WIKIDATA_ID: Record<
  string,
  Partial<Pick<Coaster, "name" | "inversions">>
> = {
  // Blackpool — rebranded from Zipper Dipper; Queue-Times & enwiki use "Blue Flyer"
  Q885702: { name: "Blue Flyer" },
  // Blackpool classic wood out-and-back; inversions must stay 0 (bad imports sometimes confuse with train count)
  Q265733: { inversions: 0 },
};

/** Normalized ride names that should always display as the current title (global renames). */
const LEGACY_DISPLAY_NAMES = new Map<string, string>([["zipper dipper", "Blue Flyer"]]);

export function applyCoasterKnownFixes<
  T extends Pick<Coaster, "name"> &
    Partial<Pick<Coaster, "wikidata_id" | "inversions">>,
>(
  c: T,
): T {
  const q = c.wikidata_id?.trim().toUpperCase();
  if (q) {
    const byWd = COASTER_FIXES_BY_WIKIDATA_ID[q];
    if (byWd) return { ...c, ...byWd };
  }
  const nk = normalizeNameKey(c.name);
  const renamed = LEGACY_DISPLAY_NAMES.get(nk);
  if (renamed) return { ...c, name: renamed };
  return c;
}
