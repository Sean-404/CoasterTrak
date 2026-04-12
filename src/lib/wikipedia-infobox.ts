/**
 * Optional enrichment: parse English Wikipedia roller coaster infobox HTML
 * for fields that are sparse on Wikidata (inversions, closing date, status, etc.).
 */

import * as cheerio from "cheerio";
import {
  parseInversionsFromText,
  parseLengthMetersFromText,
  parseSpeedMphFromText,
} from "./wikidata-coasters";

export const WIKIPEDIA_USER_AGENT =
  "CoasterTrak/0.1 (roller coaster catalog sync; https://github.com/)";

export type InfoboxExtract = {
  lengthM: number | null;
  heightM: number | null;
  speedMph: number | null;
  inversions: number | null;
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

/** Map first-column infobox labels to row text (English Wikipedia). */
export function parseInfoboxTable(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const table = $("table.infobox").first();
  const out: Record<string, string> = {};
  table.find("tr").each((_, tr) => {
    const th = $(tr).find("th").first().text().replace(/\s+/g, " ").trim();
    const td = $(tr).find("td").first().text().replace(/\s+/g, " ").trim();
    if (th && td) out[normalizeKey(th)] = td;
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
  if (t === "operating" || t === "open") return "operating";
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
