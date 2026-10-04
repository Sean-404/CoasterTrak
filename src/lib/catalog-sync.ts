/** Catalog sync entrypoint — Wikidata snapshot → Supabase (see `wikidata-catalog-sync.ts`). */
export {
  syncCatalogFromWikidata,
  type CatalogSyncChangedRef,
  type CatalogSyncResult,
} from "@/lib/wikidata-catalog-sync";
