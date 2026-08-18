/**
 * Fetch English Wikipedia lead summaries for catalog pages (AdSense / SEO content).
 */

import { sanitizeCoasterImageUrl } from "@/lib/coaster-known-fixes";
import { isWikidataQidLabel } from "@/lib/wikidata-qid";

const WIKIPEDIA_USER_AGENT =
  "CoasterTrak/0.1 (roller coaster catalog; https://coastertrak.com/)";

export type WikipediaSummary = {
  title: string;
  extract: string;
  url: string;
  /** Lead image from the page summary API (fallback when Wikidata has no P18). */
  imageUrl: string | null;
};

function encodeWikiTitle(title: string): string {
  return encodeURIComponent(title.replace(/ /g, "_"));
}

function imageUrlFromSummaryPayload(data: {
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
}): string | null {
  const raw = data.originalimage?.source?.trim() || data.thumbnail?.source?.trim() || null;
  return sanitizeCoasterImageUrl(raw);
}

export async function fetchWikipediaSummary(title: string): Promise<WikipediaSummary | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeWikiTitle(trimmed)}`,
      {
        headers: { "User-Agent": WIKIPEDIA_USER_AGENT, Accept: "application/json" },
        next: { revalidate: 86400 * 7 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
      type?: string;
      originalimage?: { source?: string };
      thumbnail?: { source?: string };
    };
    if (data.type === "disambiguation" || !data.extract?.trim()) return null;
    const url = data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeWikiTitle(trimmed)}`;
    return {
      title: data.title ?? trimmed,
      extract: data.extract.trim(),
      url,
      imageUrl: imageUrlFromSummaryPayload(data),
    };
  } catch {
    return null;
  }
}

export async function fetchEnwikiTitleFromWikidata(wikidataId: string): Promise<string | null> {
  const qid = wikidataId.trim().toUpperCase();
  if (!/^Q\d+$/.test(qid)) return null;

  try {
    const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {
      headers: { "User-Agent": WIKIPEDIA_USER_AGENT, Accept: "application/json" },
      next: { revalidate: 86400 * 30 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      entities?: Record<string, { sitelinks?: { enwiki?: { title?: string } } }>;
    };
    const entity = data.entities?.[qid];
    const title = entity?.sitelinks?.enwiki?.title?.trim();
    return title || null;
  } catch {
    return null;
  }
}

export async function fetchWikipediaSummaryForCoaster(options: {
  enwikiTitle?: string | null;
  wikidataId?: string | null;
  storedSummary?: string | null;
  storedEnwikiTitle?: string | null;
}): Promise<WikipediaSummary | null> {
  let title = options.storedEnwikiTitle?.trim() || options.enwikiTitle?.trim() || null;
  if (!title && options.wikidataId?.trim()) {
    title = await fetchEnwikiTitleFromWikidata(options.wikidataId);
  }

  const stored = options.storedSummary?.trim() || null;
  if (stored && title) {
    return {
      title: options.storedEnwikiTitle?.trim() || options.enwikiTitle?.trim() || title,
      extract: stored,
      url: `https://en.wikipedia.org/wiki/${encodeWikiTitle(title)}`,
      imageUrl: null,
    };
  }
  if (stored && !title) {
    return {
      title: options.storedEnwikiTitle?.trim() || "Wikipedia",
      extract: stored,
      url: "https://en.wikipedia.org/",
      imageUrl: null,
    };
  }

  if (!title) return null;
  return fetchWikipediaSummary(title);
}

/** Try common English Wikipedia title shapes for theme parks. */
export async function fetchWikipediaSummaryForPark(
  parkName: string,
): Promise<WikipediaSummary | null> {
  const name = parkName.trim();
  if (!name || isWikidataQidLabel(name)) return null;

  const candidates = [
    name,
    name.replace(/^Disney'?s\s+/i, ""),
    `${name} (theme park)`,
    `${name} (amusement park)`,
  ];
  // De-dupe while preserving order
  const seen = new Set<string>();
  for (const raw of candidates) {
    const t = raw.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    const hit = await fetchWikipediaSummary(t);
    if (hit) return hit;
  }
  return null;
}

/** Strip HTML and clamp length for meta / JSON-LD. */
export function clampSummaryText(text: string, maxLen = 480): string {
  const plain = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (plain.length <= maxLen) return plain;
  const cut = plain.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}
