import { NextResponse } from "next/server";
import { syncCatalogFromWikidata } from "@/lib/catalog-sync";
import { jsonSyncError, requireCronAuth, requireSyncRateLimit } from "@/lib/cron-auth";

export const maxDuration = 300;

// Called by Vercel Cron (GET). Uses SYNC_CRON_SECRET in Authorization: Bearer …
export async function GET(request: Request) {
  const rateLimitError = requireSyncRateLimit(request);
  if (rateLimitError) return rateLimitError;

  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const result = await syncCatalogFromWikidata();
    return NextResponse.json(result);
  } catch (error) {
    return jsonSyncError(error);
  }
}
