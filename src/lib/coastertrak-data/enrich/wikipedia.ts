import {
  deriveWikidataCoasterStats,
  type WikidataCoasterRow,
} from "@/lib/wikidata-coasters";
import { sanitizeCoasterImageUrl } from "@/lib/coaster-known-fixes";
import {
  extractCoasterInfobox,
  fetchWikipediaArticleHtml,
  inferStatusFromText,
} from "@/lib/wikipedia-infobox";
import { fetchWikipediaSummary } from "@/lib/wikipedia-summary";

export type WikipediaEnrichOptions = {
  limit?: number;
  enrichExtra?: boolean;
  delayMs?: number;
  onProgress?: (message: string) => void;
};

/**
 * Fill gaps / repair status from English Wikipedia roller-coaster infobox HTML.
 * Also fills missing images from the page summary API when Wikidata has no P18.
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
  let imagesFilled = 0;
  for (const row of processQueue) {
    const statGaps =
      row.lengthM == null ||
      row.speedMs == null ||
      row.heightM == null ||
      row.inversions == null ||
      row.durationS == null;
    const metaGaps = enrichExtra && row.inversions == null;
    const statusUnknown = row.status === "unknown";
    // Also re-check operating rows: Wikipedia often says "Relocated to …" / permanently closed
    // while Wikidata still lists the installation as operating.
    const statusMayNeedEnwiki =
      (row.status === "defunct" || row.status === "operating" || row.status === "unknown") &&
      Boolean(row.enwikiTitle?.trim());
    const imageGap = !sanitizeCoasterImageUrl(row.imageUrl ?? null);
    const allowStatEnrich = (statGaps || metaGaps || statusUnknown) && done < limit;
    const allowStatusRepair = statusMayNeedEnwiki && done < limit;
    const allowImageEnrich = imageGap && Boolean(row.enwikiTitle?.trim());

    if (!row.enwikiTitle || (!allowStatEnrich && !allowStatusRepair && !allowImageEnrich)) {
      byId.set(row.wikidataId, deriveWikidataCoasterStats(row));
      continue;
    }

    try {
      let next: WikidataCoasterRow = { ...row };

      if (allowStatEnrich || allowStatusRepair) {
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
        const st = (ex.statusText ?? "").toLowerCase();
        const stillHereHint =
          /\breopened\b/.test(st) ||
          /\boperating\b/.test(st) ||
          /\brelocated from\b/.test(st) ||
          /\bmoved from\b/.test(st);
        const leftParkHint =
          inferred === "defunct" ||
          /\brelocated to\b/.test(st) ||
          /\bmoved to\b/.test(st) ||
          /\bpermanently closed\b/.test(st);

        if (leftParkHint) {
          status = "defunct";
        } else if (inferred === "operating") {
          status = "operating";
        } else if (status === "unknown" || status === "operating") {
          if (ex.closingDate && !stillHereHint) {
            const closing = new Date(ex.closingDate);
            if (!Number.isNaN(closing.getTime()) && closing < new Date()) {
              status = "defunct";
            }
          }
        }

        // Closing year from infobox when missing.
        let retirementDate = row.retirementDate;
        if (!retirementDate && ex.closingDate) {
          retirementDate = ex.closingDate;
        }

        next = {
          ...next,
          lengthM,
          heightM,
          speedMs,
          inversions: allowStatEnrich ? (row.inversions ?? ex.inversions) : row.inversions,
          durationS: allowStatEnrich ? (row.durationS ?? ex.durationS) : row.durationS,
          retirementDate,
          status,
        };
        if (allowStatEnrich) done += 1;
        else if (allowStatusRepair && status !== row.status) done += 1;
      }

      if (allowImageEnrich && !sanitizeCoasterImageUrl(next.imageUrl ?? null)) {
        const summary = await fetchWikipediaSummary(row.enwikiTitle);
        const wikiImage = summary?.imageUrl ?? null;
        if (wikiImage) {
          next = { ...next, imageUrl: wikiImage };
          imagesFilled += 1;
        }
      }

      byId.set(row.wikidataId, deriveWikidataCoasterStats(next));
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    } catch {
      byId.set(row.wikidataId, deriveWikidataCoasterStats(row));
    }
  }

  log(
    `Wikipedia enrich applied to up to ${done} rows (limit ${limit}); filled ${imagesFilled} missing images`,
  );
  return rows.map((r) => byId.get(r.wikidataId) ?? deriveWikidataCoasterStats(r));
}
