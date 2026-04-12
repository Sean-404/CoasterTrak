/**
 * Optional enrichment: parse English Wikipedia roller coaster infobox HTML
 * for fields that are sparse on Wikidata (inversions, closing date, status, etc.).
 */

import * as cheerio from "cheerio";
import {
  parseDurationSecondsFromText,
  parseInversionsFromText,
  parseLengthMetersFromText,
  parseSpeedMphFromText,
} from "./wikidata-coasters";

const WIKIPEDIA_USER_AGENT =
  "CoasterTrak/0.1 (roller coaster catalog sync; https://github.com/)";

type InfoboxExtract = {
  lengthM: number | null;
  heightM: number | null;
  speedMph: number | null;
  inversions: number | null;
  /** Ride duration (track time), seconds */
  durationS: number | null;
  statusText: string | null;
  closingDate: string | null;
  rawPairs: Record<string, string>;
};

function normalizeKey(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseHeightMetersFromText(s: string): number | null {
  return parseLengthMetersFromText(s);
}

/**
 * Relocated rides often have two "Status" rows (current site + former site). Prefer the row
 * that indicates the ride still exists (e.g. "Operating") over "Removed" from the old park.
 */
function mergeDuplicateStatusCell(prev: string | undefined, next: string): string {
  if (!prev) return next;
  const score = (s: string) => {
    const t = s.toLowerCase();
    if (/\boperating\b/.test(t) || t === "open" || /\breopened\b/.test(t)) return 2;
    if (
      /\bremoved\b/.test(t) ||
      t.includes("defunct") ||
      t.includes("sbno") ||
      t.includes("demol") ||
      t.includes("scrap")
    )
      return 0;
    return 1;
  };
  return score(next) > score(prev) ? next : prev;
}

/** Map first-column infobox labels to row text (English Wikipedia). */
function parseInfoboxTable(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const table = $("table.infobox").first();
  const out: Record<string, string> = {};
  table.find("tr").each((_, tr) => {
    const th = $(tr).find("th").first().text().replace(/\s+/g, " ").trim();
    const td = $(tr).find("td").first().text().replace(/\s+/g, " ").trim();
    if (!th || !td) return;
    const k = normalizeKey(th);
    if (k === "status") {
      out[k] = mergeDuplicateStatusCell(out[k], td);
    } else {
      out[k] = td;
    }
  });
  return out;
}

function pick(
  pairs: Record<string, string>,
  patterns: RegExp[],
): string | null {
  for (const k of Object.keys(pairs)) {
    if (patterns.some((p) => p.test(k))) return pairs[k];
  }
  return null;
}

/**
 * Infer operating/defunct from a raw Wikipedia infobox "Status" value.
 * Returns null when the text is ambiguous (e.g. plain "Closed" which can
 * mean seasonal or seasonal maintenance).
 */
export function inferStatusFromText(
  text: string | null,
): "operating" | "defunct" | null {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  // Prefer still-open signals first: Wikidata often encodes an old closure (relocation) while
  // enwiki Status still describes the current installation ("Operating", "Relocated to …").
  if (
    /\boperating\b/.test(t) ||
    t === "open" ||
    /\breopened\b/.test(t) ||
    /\brelocated to\b/.test(t) ||
    /\bmoved to\b/.test(t) ||
    /\boperating at\b/.test(t) ||
    /\bopen at\b/.test(t)
  ) {
    return "operating";
  }
  if (
    t.includes("remov") ||
    t.includes("demol") ||
    t.includes("defunct") ||
    t.includes("sbno") ||
    t.includes("standing but not operating") ||
    t.includes("permanently closed") ||
    t.includes("torn down") ||
    t.includes("scrap")
  )
    return "defunct";
  return null;
}

/** Extract a 4-digit year from free-text like "2017", "January 2017", etc. */
function parseYearFromText(s: string): number | null {
  const m = /\b(1[89]\d{2}|20[012]\d)\b/.exec(s);
  return m ? parseInt(m[1], 10) : null;
}

export function extractCoasterInfobox(html: string): InfoboxExtract {
  const rawPairs = parseInfoboxTable(html);
  const lengthStr = pick(rawPairs, [/^length$/i, /^track length$/i]);
  const heightStr = pick(rawPairs, [/^height$/i, /^max height$/i, /^lift height$/i]);
  const speedStr = pick(rawPairs, [/^speed$/i, /^max speed$/i]);
  const invStr = pick(rawPairs, [/^inversions$/i, /^inversion/i]);
  const durationStr = pick(rawPairs, [
    /^duration\b/i,
    /^ride duration$/i,
    /^length of ride$/i,
    /^ride time$/i,
    /^run time$/i,
    /^running time$/i,
    /^cycle time$/i,
    /^total time$/i,
    /^time\s*\(?\s*ride\)?$/i,
  ]);
  const statusStr = pick(rawPairs, [/^status$/i]);
  const closingStr = pick(rawPairs, [
    /^clos(?:ing|e) date$/i,
    /^date closed$/i,
    /^closed$/i,
    /^end date$/i,
  ]);

  return {
    lengthM: lengthStr ? parseLengthMetersFromText(lengthStr) : null,
    heightM: heightStr ? parseHeightMetersFromText(heightStr) : null,
    speedMph: speedStr ? parseSpeedMphFromText(speedStr) : null,
    inversions: invStr ? parseInversionsFromText(invStr) : null,
    durationS: durationStr ? parseDurationSecondsFromText(durationStr) : null,
    statusText: statusStr ?? null,
    closingDate: closingStr
      ? (() => {
          const y = parseYearFromText(closingStr);
          return y ? `${y}-01-01` : null;
        })()
      : null,
    rawPairs,
  };
}

export async function fetchWikipediaArticleHtml(
  title: string,
  timeoutMs = 12_000,
): Promise<string> {
  const enc = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/html/${enc}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIPEDIA_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Wikipedia REST ${res.status} for ${title}`);
  }
  return res.text();
}
