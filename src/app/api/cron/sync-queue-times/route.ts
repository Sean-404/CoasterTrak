import { NextResponse } from "next/server";
import { syncCatalogFromQueueTimes } from "@/lib/catalog-sync";
import { jsonSyncError, requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 300; // 5 min — maximum allowed by Vercel

// Called by Vercel Cron on a weekly schedule.
// Vercel automatically sets Authorization: Bearer $CRON_SECRET on cron requests.
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const result = await syncCatalogFromQueueTimes();
    return NextResponse.json(result);
  } catch (error) {
    return jsonSyncError(error);
  }
}
