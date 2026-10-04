import { NextResponse } from "next/server";
import { revalidatePublicCatalog } from "@/lib/catalog-revalidate";
import { syncCatalogFromWikidata } from "@/lib/catalog-sync";
import { jsonSyncError, requireCronAuth, requireSyncRateLimit } from "@/lib/cron-auth";

export async function POST(request: Request) {
  const rateLimitError = requireSyncRateLimit(request);
  if (rateLimitError) return rateLimitError;

  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const result = await syncCatalogFromWikidata();
    const changed =
      result.changedParks.length + result.changedCoasters.length > 0;
    if (changed) {
      revalidatePublicCatalog({
        parks: result.changedParks,
        coasters: result.changedCoasters,
      });
    }
    return NextResponse.json({ ...result, revalidated: changed });
  } catch (error) {
    return jsonSyncError(error);
  }
}
