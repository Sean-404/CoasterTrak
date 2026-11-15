import type { Coaster } from "@/types/domain";
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
      label: "Wikidata",
      href: wikidata,
      detail: `Item ${coaster.wikidata_id!.trim()}: ride identity, park, status and most measurements`,
    });
  }
  const wikipedia = wikipediaUrl || enwikiArticleUrl(coaster.enwiki_title);
  if (wikipedia) {
    links.push({
      label: "Wikipedia",
      href: wikipedia,
      detail: "Photo and gaps in the measurements; read it for the ride's history",
    });
  }
  const rcdb = rcdbCoasterUrl(coaster.rcdb_id);
  if (rcdb) {
    links.push({
      label: "RCDB (link only)",
      href: rcdb,
      detail: `Entry #${normalizeRcdbId(coaster.rcdb_id)}, linked by its Wikidata ID. No RCDB data is copied.`,
    });
  }
  return links;
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
