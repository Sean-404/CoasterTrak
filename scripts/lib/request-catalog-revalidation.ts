/**
 * Ask production (or NEXT_PUBLIC_SITE_URL) to bust the public catalog cache.
 * Used after DB-side auto-repair so new parks/rides are not sticky 404s.
 */
import { SITE_URL } from "../../src/lib/site-url";

export async function requestPublicCatalogRevalidation(opts?: {
  origin?: string;
  secret?: string;
}): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  const secret = opts?.secret ?? process.env.SYNC_CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false, skipped: true, error: "SYNC_CRON_SECRET not set" };
  }

  const origin = (opts?.origin ?? process.env.CATALOG_REVALIDATE_ORIGIN ?? SITE_URL).replace(
    /\/+$/,
    "",
  );
  const url = `${origin}/api/cron/revalidate-catalog`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        error: body.slice(0, 300) || res.statusText,
      };
    }
    return { ok: true, status: res.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
