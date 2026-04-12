import { NextResponse } from "next/server";
import { syncCatalogFromWikidata } from "@/lib/catalog-sync";

export const maxDuration = 300;

// Called by Vercel Cron (GET). Uses SYNC_CRON_SECRET in Authorization: Bearer …
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
    const result = await syncCatalogFromWikidata();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
