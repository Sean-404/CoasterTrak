import { NextResponse } from "next/server";
import { requireCronAuth, requireSyncRateLimit } from "@/lib/cron-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sendWeeklyDigests } from "@/lib/weekly-digest";

export const maxDuration = 300;

/** Sunday weekly digest cron (Vercel Cron GET + Bearer SYNC_CRON_SECRET). */
export async function GET(request: Request) {
  const rateLimitError = requireSyncRateLimit(request);
  if (rateLimitError) return rateLimitError;

  const authError = requireCronAuth(request);
  if (authError) return authError;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const result = await sendWeeklyDigests(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Weekly digest cron failed", error);
    return NextResponse.json({ error: "Weekly digest failed" }, { status: 500 });
  }
}
