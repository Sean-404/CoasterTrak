import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

function configuredCatalogAllowedHosts(): Set<string> {
  const hosts = new Set<string>();

  const explicit = process.env.WIKIDATA_COASTERS_ALLOWED_HOSTS
    ?.split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const host of explicit ?? []) hosts.add(host);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    try {
      hosts.add(new URL(supabaseUrl).hostname.toLowerCase());
    } catch {
      // Ignore malformed env; fetch path has its own validation/error messages.
    }
  }

  return hosts;
}

export function parseAndValidateCatalogUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("WIKIDATA_COASTERS_URL is not a valid URL");
  }

  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const isHttps = parsed.protocol === "https:";
  const isLocalHttp = parsed.protocol === "http:" && isLocalHost;
  if (!isHttps && !isLocalHttp) {
    throw new Error("WIKIDATA_COASTERS_URL must use https (or http for localhost)");
  }

  const allowedHosts = configuredCatalogAllowedHosts();
  if (allowedHosts.size > 0 && !allowedHosts.has(host)) {
    throw new Error(
      `WIKIDATA_COASTERS_URL host "${host}" is not allowlisted. ` +
        "Add it to WIKIDATA_COASTERS_ALLOWED_HOSTS.",
    );
  }

  return parsed;
}

/**
 * Load the Wikidata coaster catalog JSON from WIKIDATA_COASTERS_URL (preferred)
 * or a local file path (WIKIDATA_COASTERS_PATH / data/wikidata_coasters.json).
 */
export async function loadWikidataCatalogRows(options?: {
  /** Next.js fetch cache revalidate seconds when loading from URL. */
  revalidateSeconds?: number;
}): Promise<WikidataCoasterRow[]> {
  const url = process.env.WIKIDATA_COASTERS_URL?.trim();
  if (url) {
    const validated = parseAndValidateCatalogUrl(url);
    const revalidate = options?.revalidateSeconds ?? 3600;
    const res = await fetch(validated, { next: { revalidate } });
    if (!res.ok) {
      throw new Error(`WIKIDATA_COASTERS_URL fetch failed (${res.status})`);
    }
    return JSON.parse(await res.text()) as WikidataCoasterRow[];
  }

  const rel = process.env.WIKIDATA_COASTERS_PATH?.trim() ?? "data/wikidata_coasters.json";
  const filepath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  let raw: string;
  try {
    raw = await readFile(filepath, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(
        `Wikidata catalog file missing (${filepath}). Run \`npm run wikidata:fetch\` to create it, ` +
          "or set WIKIDATA_COASTERS_URL to a hosted JSON (see README).",
      );
    }
    throw e;
  }
  return JSON.parse(raw) as WikidataCoasterRow[];
}
