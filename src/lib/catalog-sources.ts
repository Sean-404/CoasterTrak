import type { Coaster } from "@/types/domain";
import { coasterLifecycle } from "@/lib/coaster-status";
import { normalizeRcdbId, rcdbCoasterUrl } from "@/lib/rcdb";
import { CONTACT_EMAIL } from "@/lib/site-url";

export type SourceLink = { label: string; href: string; detail: string };

const QID_RE = /^Q\d+$/;

export function wikidataItemUrl(qid: string | null | undefined): string | null {
  const id = qid?.trim();
  return id && QID_RE.test(id) ? `https://www.wikidata.org/wiki/${id}` : null;
}

export function enwikiArticleUrl(title: string | null | undefined): string | null {
  const t = title?.trim();
  if (!t) return null;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;
}

/** Where this coaster record came from, in the order the pipeline trusts them. */
export function coasterSourceLinks(
  coaster: Pick<Coaster, "wikidata_id" | "enwiki_title" | "rcdb_id">,
  wikipediaUrl?: string | null,
): SourceLink[] {
  const links: SourceLink[] = [];
  const wikidata = wikidataItemUrl(coaster.wikidata_id);
  if (wikidata) {
    links.push({
      label: `Wikidata ${coaster.wikidata_id!.trim()}`,
      href: wikidata,
      detail: "Ride identity, park, status and most measurements",
    });
  }
  const wikipedia = wikipediaUrl || enwikiArticleUrl(coaster.enwiki_title);
  if (wikipedia) {
    links.push({
      label: "Wikipedia article",
      href: wikipedia,
      detail: "Photo, background summary and gaps in the measurements",
    });
  }
  const rcdb = rcdbCoasterUrl(coaster.rcdb_id);
  if (rcdb) {
    links.push({
      label: `RCDB #${normalizeRcdbId(coaster.rcdb_id)}`,
      href: rcdb,
      detail: "Link only (ID from Wikidata) — no RCDB data is copied",
    });
  }
  return links;
}

/** Fields we do not have for this ride, phrased for readers. */
export function coasterMissingFields(coaster: Coaster): string[] {
  const missing: string[] = [];
  if (coasterLifecycle(coaster) === "Unknown") missing.push("operating status");
  if (!coaster.manufacturer?.trim()) missing.push("manufacturer");
  if (coaster.opening_year == null) missing.push("opening year");
  if (coaster.height_ft == null) missing.push("height");
  if (coaster.speed_mph == null) missing.push("speed");
  if (coaster.length_ft == null) missing.push("length");
  if (coaster.inversions == null) missing.push("inversions");
  if (coaster.duration_s == null) missing.push("ride duration");
  if (!coaster.image_url) missing.push("photo");
  return missing;
}

export type ParkDataCoverage = {
  total: number;
  linkedToWikidata: number;
  statusConfirmed: number;
  withHeight: number;
  withPhoto: number;
};

export function parkDataCoverage(coasters: Coaster[]): ParkDataCoverage {
  return {
    total: coasters.length,
    linkedToWikidata: coasters.filter((c) => wikidataItemUrl(c.wikidata_id) != null).length,
    statusConfirmed: coasters.filter((c) => coasterLifecycle(c) !== "Unknown").length,
    withHeight: coasters.filter((c) => c.height_ft != null).length,
    withPhoto: coasters.filter((c) => Boolean(c.image_url)).length,
  };
}

/** Pre-filled correction email so reports arrive with the page they are about. */
export function correctionMailto(subjectName: string, pageUrl: string): string {
  const subject = `Catalog correction: ${subjectName}`;
  const body = [
    `Page: ${pageUrl}`,
    "",
    "What looks wrong:",
    "",
    "What it should be:",
    "",
    "Source we can check (park, manufacturer or news page):",
    "",
  ].join("\n");
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
