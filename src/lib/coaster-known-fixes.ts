import type { Coaster } from "@/types/domain";

/** Generic guard: suppress incident/disaster-style image URLs from Wikidata/Commons. */
export function isLikelyIncidentImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  const u = `${url} ${decoded}`.toLowerCase();
  return /\b(incident|disaster|derailment|collision|crash|explosion|fatal)\b/.test(u);
}

/** Use when persisting or displaying `image_url` so known-bad Commons files never stick. */
export function sanitizeCoasterImageUrl(url: string | null | undefined): string | null {
  if (url == null || url === "") return null;
  if (isLikelyIncidentImageUrl(url)) return null;
  return url;
}

/**
 * Correct catalog rows where enrichment lagged behind Wikipedia / Queue-Times renames,
 * or a one-off bad stat slipped in. Prefer wikidata_id; use legacy names only when unambiguous.
 */
const COASTER_FIXES_BY_WIKIDATA_ID: Record<
  string,
  Partial<
    Pick<
      Coaster,
      "name" | "inversions" | "coaster_type" | "status" | "manufacturer" | "image_url"
    >
  >
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
        "wikidata_id" | "inversions" | "coaster_type" | "status" | "manufacturer" | "image_url"
      >
    >,
>(
  c: T,
): T {
  let out: T = c;
  const q = c.wikidata_id?.trim().toUpperCase();
  if (q) {
    const byWd = COASTER_FIXES_BY_WIKIDATA_ID[q];
    if (byWd) out = { ...out, ...byWd };
  }
  const cleaned = sanitizeCoasterImageUrl(out.image_url ?? null);
  if (cleaned !== out.image_url) {
    out = { ...out, image_url: cleaned };
  }
  return out;
}
