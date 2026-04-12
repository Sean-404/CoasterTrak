import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function startSyncRun(source: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
  }

  const startedAt = new Date().toISOString();
  const runStart = await supabase
    .from("sync_runs")
    .insert({ source, status: "running", started_at: startedAt })
    .select("id")
    .single();
  return { supabase, startedAt, runId: runStart.data?.id ?? null };
}

export async function finishSyncRun(
  runId: number | null,
  status: "success" | "failed",
  payload: { recordsUpdated?: number; error?: string | null } = {},
) {
  const supabase = getSupabaseServerClient();
  if (!supabase || !runId) return;

  await supabase
    .from("sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_updated: payload.recordsUpdated ?? 0,
      error: payload.error ?? null,
    })
    .eq("id", runId);
}
