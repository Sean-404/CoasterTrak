import { NextResponse } from "next/server";
import { revalidatePublicCatalog } from "@/lib/catalog-revalidate";
import { requireCronAuth, requireSyncRateLimit } from "@/lib/cron-auth";

export const runtime = "nodejs";

/**
 * Bust the public catalog cache after DB-side repairs / gap fills
 * without running a full Wikidata sync.
 *
 * Auth: Authorization: Bearer $SYNC_CRON_SECRET
 */
export async function POST(request: Request) {
  const rateLimitError = requireSyncRateLimit(request);
  if (rateLimitError) return rateLimitError;

  const authError = requireCronAuth(request);
  if (authError) return authError;

  revalidatePublicCatalog();
  return NextResponse.json({ ok: true, revalidated: true });
}

export async function GET(request: Request) {
  return POST(request);
}
