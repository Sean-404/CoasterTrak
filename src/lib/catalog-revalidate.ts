import { revalidatePath, revalidateTag } from "next/cache";

/** Shared with `unstable_cache` so a catalog sync can drop the cached catalog before pages regenerate. */
export const CATALOG_CACHE_TAG = "catalog";

/**
 * Mark public catalog pages stale after a successful sync.
 * Stale-while-revalidate: the next request serves the last page, then regenerates.
 * ISR writes are billed only when that regeneration actually changes the output.
 */
export function revalidatePublicCatalog() {
  revalidateTag(CATALOG_CACHE_TAG, "max");
  revalidatePath("/parks");
  revalidatePath("/coasters");
  revalidatePath("/sitemap.xml");
  revalidatePath("/parks/[slug]", "page");
  revalidatePath("/coasters/[slug]", "page");
}
