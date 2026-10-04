import { revalidatePath, revalidateTag } from "next/cache";
import { coasterSlug, parkSlug } from "@/lib/slug";

/** Shared with `unstable_cache` so a catalog sync can drop the cached catalog before pages regenerate. */
export const CATALOG_CACHE_TAG = "catalog";

export type CatalogDetailRef = {
  id: number;
  name: string;
};

/**
 * Bust shared catalog data + list/sitemap surfaces after sync.
 * Does not touch every park/coaster detail page — that was burning Hobby ISR writes.
 */
export function revalidateCatalogIndexes() {
  revalidateTag(CATALOG_CACHE_TAG, "max");
  revalidatePath("/parks");
  revalidatePath("/coasters");
  revalidatePath("/sitemap.xml");
  revalidatePath("/catalog");
}

/** Revalidate specific park detail pages that actually changed. */
export function revalidateParkDetails(parks: CatalogDetailRef[]) {
  for (const park of parks) {
    if (!park.id || !park.name?.trim()) continue;
    revalidatePath(`/parks/${parkSlug(park.name, park.id)}`);
  }
}

/** Revalidate specific coaster detail pages that actually changed. */
export function revalidateCoasterDetails(coasters: CatalogDetailRef[]) {
  for (const coaster of coasters) {
    if (!coaster.id || !coaster.name?.trim()) continue;
    revalidatePath(`/coasters/${coasterSlug(coaster.name, coaster.id)}`);
  }
}

/**
 * After a successful sync with real content changes: refresh indexes, then only
 * the detail pages for changed parks/coasters.
 */
export function revalidatePublicCatalog(opts?: {
  parks?: CatalogDetailRef[];
  coasters?: CatalogDetailRef[];
}) {
  revalidateCatalogIndexes();
  if (opts?.parks?.length) revalidateParkDetails(opts.parks);
  if (opts?.coasters?.length) revalidateCoasterDetails(opts.coasters);
}
