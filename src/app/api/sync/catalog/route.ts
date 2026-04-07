import { NextResponse } from "next/server";
import { syncCatalogFromKaggleCsv, syncCatalogFromQueueTimes } from "@/lib/catalog-sync";

function isAuthorized(request: Request) {
  const secret = process.env.SYNC_CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  return token === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source") ?? "queue-times";
    const result = source === "kaggle" ? await syncCatalogFromKaggleCsv() : await syncCatalogFromQueueTimes();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
