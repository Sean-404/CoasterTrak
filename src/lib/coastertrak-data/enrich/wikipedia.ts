import {
  deriveWikidataCoasterStats,
  type WikidataCoasterRow,
} from "@/lib/wikidata-coasters";
import {
  extractCoasterInfobox,
  fetchWikipediaArticleHtml,
  inferStatusFromText,
} from "@/lib/wikipedia-infobox";

export type WikipediaEnrichOptions = {
  limit?: number;
  enrichExtra?: boolean;
  delayMs?: number;
  onProgress?: (message: string) => void;
};

/**
 * Fill gaps / repair status from English Wikipedia roller-coaster infobox HTML.
 * Does not fetch Wikidata — operates on an existing snapshot.
 */
export async function enrichWikidataRowsFromWikipedia(
  rows: WikidataCoasterRow[],
  options: WikipediaEnrichOptions = {},
): Promise<WikidataCoasterRow[]> {
  const limit = options.limit ?? 1000;
  const enrichExtra = options.enrichExtra ?? false;
  const delayMs = options.delayMs ?? 800;
  const log = options.onProgress ?? (() => {});

  const priorityDefunct = (r: WikidataCoasterRow) =>
    r.status === "defunct" && Boolean(r.enwikiTitle?.trim());
  const processQueue = [...rows].sort((a, b) => {
    const pa = priorityDefunct(a) ? 0 : 1;
    const pb = priorityDefunct(b) ? 0 : 1;
    return pa - pb;
  });

  const byId = new Map<string, WikidataCoasterRow>();
  let done = 0;
  for (const row of processQueue) {
    const statGaps =
      row.lengthM == null ||
      row.speedMs == null ||
      row.heightM == null ||
      row.inversions == null ||
      row.durationS == null;
    const metaGaps = enrichExtra && row.inversions == null;
    const statusUnknown = row.status === "unknown";
    const statusMayNeedEnwiki =
      row.status === "defunct" && Boolean(row.enwikiTitle?.trim());
    const allowStatEnrich = (statGaps || metaGaps || statusUnknown) && done < limit;
    const allowStatusRepair = statusMayNeedEnwiki;
    if (!row.enwikiTitle || (!allowStatEnrich && !allowStatusRepair)) {
      byId.set(row.wikidataId, deriveWikidataCoasterStats(row));
      continue;
    }
    try {
      const html = await fetchWikipediaArticleHtml(row.enwikiTitle);
      const ex = extractCoasterInfobox(html);
      const lengthM = allowStatEnrich ? (row.lengthM ?? ex.lengthM) : row.lengthM;
      const heightM = allowStatEnrich ? (row.heightM ?? ex.heightM) : row.heightM;
      const speedMs = allowStatEnrich
        ? (row.speedMs ??
          (ex.speedMph != null ? ex.speedMph / 2.23693629 : null))
        : row.speedMs;

      let status = row.status;
      const inferred = inferStatusFromText(ex.statusText);
      if (inferred === "operating") {
        status = "operating";
      } else if (status === "unknown") {
        if (inferred === "defunct") {
          status = "defunct";
        } else if (ex.closingDate) {
          const st = (ex.statusText ?? "").toLowerCase();
          const relocationHint =
            /\brelocated\b/.test(st) ||
            /\bmoved to\b/.test(st) ||
            /\breopened\b/.test(st) ||
            /\boperating\b/.test(st);
          if (!relocationHint) {
            const closing = new Date(ex.closingDate);
            if (!Number.isNaN(closing.getTime()) && closing < new Date()) {
              status = "defunct";
            }
          }
        }
      }

      const merged = deriveWikidataCoasterStats({
        ...row,
        lengthM,
        heightM,
        speedMs,
        inversions: allowStatEnrich ? (row.inversions ?? ex.inversions) : row.inversions,
        durationS: allowStatEnrich ? (row.durationS ?? ex.durationS) : row.durationS,
        status,
      });
      byId.set(row.wikidataId, merged);
      if (allowStatEnrich) done += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    } catch {
      byId.set(row.wikidataId, deriveWikidataCoasterStats(row));
    }
  }

  log(`Wikipedia enrich applied to up to ${done} rows (limit ${limit})`);
  return rows.map((r) => byId.get(r.wikidataId) ?? deriveWikidataCoasterStats(r));
}
