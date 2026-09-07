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
    if (result.parkUpdates + result.coasterUpdates > 0) {
      revalidatePublicCatalog();
    }
    return NextResponse.json(result);
  } catch (error) {
    return jsonSyncError(error);
  }
}
