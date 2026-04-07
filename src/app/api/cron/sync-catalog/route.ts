import { NextResponse } from "next/server";
import { syncCatalogFromKaggleCsv } from "@/lib/catalog-sync";

// Called by Vercel Cron (GET) and by the GitHub Action (also GET).
// Vercel automatically sets Authorization: Bearer $CRON_SECRET on cron requests.
// The GitHub Action passes SYNC_CRON_SECRET in the same header so one secret covers both.
export async function GET(request: Request) {
  const secret = process.env.SYNC_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SYNC_CRON_SECRET not configured" }, { status: 500 });
  }

  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncCatalogFromKaggleCsv();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
