/**
 * Fetch + parse coaster stats from rcdb.com (rate-limited).
 * Only use after written permission from RCDB / Duane.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { normalizeRcdbId, rcdbCoasterUrl } from "@/lib/rcdb";
import type { RcdbStatsExportRow } from "@/lib/coastertrak-data/enrich/rcdb";

export const RCDB_USER_AGENT =
  "CoasterTrak/0.1 (catalog enrich; permission granted; https://github.com/Sean-404/CoasterTrak)";

function parseDurationSeconds(raw: string): number | null {
  const t = raw.trim();
  const m = /^(\d+):([0-5]\d)$/.exec(t);
  if (m) {
    const minutes = Number(m[1]);
    const seconds = Number(m[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds;
  }
  const asNum = Number(t.replace(/[^\d.]/g, ""));
  return Number.isFinite(asNum) && asNum > 0 ? Math.round(asNum) : null;
}

function cellNumber(cell: cheerio.Cheerio<AnyNode>): number | null {
  const floatText = cell.find("span.float, span.int").first().text().trim();
  const raw = (floatText || cell.text()).replace(/,/g, "").trim();
  const n = Number.parseFloat(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function mapFeatureStatus(text: string): string | null {
  const s = text.toLowerCase();
  if (!s.trim()) return null;
  if (/\boperating\b/.test(s) && !/\bremoved\b/.test(s) && !/\bclosed\b/.test(s)) {
    return "Operating";
  }
  if (/\b(removed|defunct|demolished|scrapped)\b/.test(s) || /\bsbno\b/.test(s)) {
    return "Defunct";
  }
  return null;
}

/** Parse a coaster detail HTML page into null-fillable stats. */
export function parseRcdbCoasterHtml(html: string, rcdbId: string): RcdbStatsExportRow | null {
  const id = normalizeRcdbId(rcdbId);
  if (!id) return null;

  const $ = cheerio.load(html);
  const out: RcdbStatsExportRow = { rcdbId: id };

  $("section").each((_, section) => {
    const heading = $(section).find("h3").first().text().trim().toLowerCase();
    if (heading !== "tracks") return;
    $(section)
      .find("table.stat-tbl tr")
      .each((__, row) => {
        const key = $(row).find("th").first().text().trim().toLowerCase();
        const cell = $(row).find("td").first();
        if (!key || !cell.length) return;
        if (key === "length") out.lengthFt = cellNumber(cell);
        else if (key === "height") out.heightFt = cellNumber(cell);
        else if (key === "speed") out.speedMph = cellNumber(cell);
        else if (key === "inversions") {
          const n = cellNumber(cell);
          out.inversions = n != null ? Math.round(n) : null;
        } else if (key === "duration") {
          out.durationS = parseDurationSeconds(cell.text());
        }
      });
  });

  const featureStatus = $("#feature > p, #feature p").first().text();
  out.status = mapFeatureStatus(featureStatus);

  const hasAny =
    out.lengthFt != null ||
    out.heightFt != null ||
    out.speedMph != null ||
    out.durationS != null ||
    out.inversions != null ||
    Boolean(out.status);
  return hasAny ? out : null;
}

export async function fetchRcdbCoasterStats(
  rcdbId: string,
  options: { signal?: AbortSignal } = {},
): Promise<RcdbStatsExportRow | null> {
  const id = normalizeRcdbId(rcdbId);
  const url = rcdbCoasterUrl(id);
  if (!id || !url) return null;

  const res = await fetch(url, {
    headers: { "User-Agent": RCDB_USER_AGENT, Accept: "text/html" },
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`RCDB fetch failed for ${id}: HTTP ${res.status}`);
  }
  const html = await res.text();
  return parseRcdbCoasterHtml(html, id);
}

export function rcdbRowNeedsStats(row: {
  rcdbId?: string | null;
  lengthFt?: number | null;
  heightFt?: number | null;
  speedMph?: number | null;
  durationS?: number | null;
  inversions?: number | null;
}): boolean {
  if (!normalizeRcdbId(row.rcdbId)) return false;
  return (
    row.lengthFt == null ||
    row.heightFt == null ||
    row.speedMph == null ||
    row.durationS == null ||
    row.inversions == null
  );
}
