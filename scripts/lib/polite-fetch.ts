/**
 * Rate-limited JSON fetcher with an on-disk response cache, for public APIs we must not hammer
 * (ThemeParks.wiki, Overpass). Each cache file records the URL and when it was fetched, so the
 * fetched-at time can be cited as evidence even when a later run reads from cache.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const COASTERTRAK_DATA_USER_AGENT =
  "CoasterTrakData/0.2 (catalog status verification; https://github.com/Sean-404/CoasterTrak)";

export type CachedJson<T> = { data: T; url: string; fetchedAt: string; fromCache: boolean };

type CacheFile = { url: string; body?: string; fetchedAt: string; data: unknown };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createPoliteFetcher(opts: {
  cacheDir: string;
  /** Gap between the end of one request and the start of the next. */
  minIntervalMs: number;
  maxAgeMs: number;
  /** Never touch the network; fail on cache miss. */
  offline?: boolean;
  maxAttempts?: number;
  log?: (message: string) => void;
}) {
  let lastRequestEnd = 0;
  const maxAttempts = opts.maxAttempts ?? 4;
  const log = opts.log ?? (() => {});

  async function getJson<T>(url: string, init?: { body?: string }): Promise<CachedJson<T>> {
    const key = createHash("sha1").update(`${url}\n${init?.body ?? ""}`).digest("hex");
    const file = join(opts.cacheDir, `${key}.json`);
    try {
      const cached = JSON.parse(await readFile(file, "utf8")) as CacheFile;
      if (opts.offline || Date.now() - Date.parse(cached.fetchedAt) < opts.maxAgeMs) {
        return { data: cached.data as T, url, fetchedAt: cached.fetchedAt, fromCache: true };
      }
    } catch {
      // cache miss
    }
    if (opts.offline) throw new Error(`Offline and not cached: ${url}`);

    for (let attempt = 1; ; attempt++) {
      const wait = lastRequestEnd + opts.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      let res: Response;
      try {
        res = await fetch(url, {
          method: init?.body ? "POST" : "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": COASTERTRAK_DATA_USER_AGENT,
            ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
          body: init?.body,
        });
      } finally {
        lastRequestEnd = Date.now();
      }

      if (res.ok) {
        const data = (await res.json()) as T;
        const fetchedAt = new Date().toISOString();
        await mkdir(opts.cacheDir, { recursive: true });
        const entry: CacheFile = { url, body: init?.body, fetchedAt, data };
        await writeFile(file, JSON.stringify(entry), "utf8");
        return { data, url, fetchedAt, fromCache: false };
      }

      const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (!retryable || attempt >= maxAttempts) {
        throw new Error(`${res.status} ${res.statusText} for ${url}`);
      }
      const retryAfter = Number(res.headers.get("Retry-After"));
      const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15_000 * attempt;
      log(`  ${res.status} from ${new URL(url).host}; waiting ${Math.round(backoffMs / 1000)}s (attempt ${attempt})`);
      await sleep(backoffMs);
    }
  }

  return { getJson };
}
