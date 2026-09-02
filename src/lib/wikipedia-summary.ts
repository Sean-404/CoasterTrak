/**
 * Fetch English Wikipedia lead summaries for catalog pages (AdSense / SEO content).
 */

import { cleanCoasterName } from "@/lib/display";
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

/** Common English Wikipedia title shapes for individual roller coasters. */
export function buildCoasterEnwikiTitleCandidates(
  rideName: string,
  parkName?: string | null,
): string[] {
  const name = cleanCoasterName(rideName).trim();
  if (!name || isWikidataQidLabel(name)) return [];

  const park = parkName?.trim() || null;
  const parkShort = park
    ?.replace(/^Disney'?s\s+/i, "")
    .replace(/\s+(theme|amusement)\s+park$/i, "")
    .trim();

  const raw = [
    name,
    `${name} (roller coaster)`,
    park ? `${name} (${park})` : null,
    parkShort && parkShort !== park ? `${name} (${parkShort})` : null,
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    const t = candidate?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Reject park/disaster/person articles that Wikipedia redirects can land on. */
export function isLikelyCoasterSummary(rideName: string, summary: WikipediaSummary): boolean {
  const extract = summary.extract.toLowerCase();
  const title = summary.title.toLowerCase();
  if (
    /\b(disaster|accident|incident|derailment|collision)\b/.test(title) ||
    /\b(disaster|accident|incident)\b/.test(extract.slice(0, 160))
  ) {
    return false;
  }
  if (/\bmay refer to:\b/i.test(extract) || /^the generic roller coaster\b/i.test(extract)) {
    return false;
  }

  const rideTokens = rideName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !["the", "and", "with", "from", "roller", "coaster"].includes(t));
  const titleHits = rideTokens.filter((t) => title.includes(t)).length;
  const extractHits = rideTokens.filter((t) => extract.includes(t)).length;
  const strongHits = rideTokens.filter(
    (t) => t.length >= 6 && (title.includes(t) || extract.includes(t)),
  ).length;
  const nameOverlap = strongHits >= 1 || titleHits + extractHits >= 2;

  const coasterLike =
    /\b(roller coaster|steel coaster|wooden coaster|launched roller coaster|mine train|junior roller coaster|inverted roller coaster|shuttle roller coaster)\b/.test(
      extract,
    ) || /\(roller coaster\)/i.test(summary.title);

  if (/\b(amusement park|theme park|summer resort|water park)\b/.test(extract.slice(0, 120)) && !coasterLike) {
    return false;
  }

  // Generic single-word ride names often redirect to unrelated articles (Cyclone, Demon, Corkscrew).
  if (rideTokens.length <= 1 && !coasterLike) return false;

  if (coasterLike) {
    return nameOverlap || rideTokens.length === 0;
  }
  if (/\bcoaster\b/.test(extract)) {
    return nameOverlap;
  }
  return titleHits >= Math.min(2, Math.max(rideTokens.length, 1)) && /\(/.test(summary.title);
}

export async function searchEnwikiTitles(query: string, limit = 5): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}` +
      `&limit=${limit}&namespace=0&format=json&origin=*`;
    const res = await fetch(url, {
      headers: { "User-Agent": WIKIPEDIA_USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return (data[1] ?? []).map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export type ResolveCoasterWikipediaSummaryOptions = {
  rideName: string;
  parkName?: string | null;
  enwikiTitle?: string | null;
  wikidataId?: string | null;
};

/** Resolve a coaster article via sitelink, title guesses, then Wikipedia search. */
export async function resolveCoasterWikipediaSummary(
  options: ResolveCoasterWikipediaSummaryOptions,
): Promise<WikipediaSummary | null> {
  const titles: string[] = [];
  const seen = new Set<string>();
  const pushTitle = (raw: string | null | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    titles.push(t);
  };

  pushTitle(options.enwikiTitle);
  if (options.wikidataId?.trim()) {
    pushTitle(await fetchEnwikiTitleFromWikidata(options.wikidataId));
  }
  for (const candidate of buildCoasterEnwikiTitleCandidates(options.rideName, options.parkName)) {
    pushTitle(candidate);
  }

  for (const title of titles) {
    const summary = await fetchWikipediaSummary(title);
    const extract = summary?.extract?.trim();
    if (!summary || !extract || extract.length < 40) continue;
    if (!isLikelyCoasterSummary(options.rideName, summary)) continue;
    return summary;
  }

  const name = cleanCoasterName(options.rideName).trim();
  const park = options.parkName?.trim();
  const searchQueries = [
    park ? `${name} ${park} roller coaster` : null,
    `${name} roller coaster`,
  ].filter(Boolean) as string[];

  for (const query of searchQueries) {
    const hits = await searchEnwikiTitles(query, 5);
    for (const title of hits) {
      if (seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      const summary = await fetchWikipediaSummary(title);
      const extract = summary?.extract?.trim();
      if (!summary || !extract || extract.length < 40) continue;
      if (!isLikelyCoasterSummary(options.rideName, summary)) continue;
      return summary;
    }
  }

  return null;
}

export async function fetchWikipediaSummaryForCoaster(options: {
  rideName?: string | null;
  parkName?: string | null;
  enwikiTitle?: string | null;
  wikidataId?: string | null;
  storedSummary?: string | null;
  storedEnwikiTitle?: string | null;
}): Promise<WikipediaSummary | null> {
  const stored = options.storedSummary?.trim() || null;
  const storedTitle = options.storedEnwikiTitle?.trim() || options.enwikiTitle?.trim() || null;

  if (stored) {
    return {
      title: storedTitle || "Wikipedia",
      extract: stored,
      url: storedTitle
        ? `https://en.wikipedia.org/wiki/${encodeWikiTitle(storedTitle)}`
        : "https://en.wikipedia.org/",
      imageUrl: null,
    };
  }

  if (options.rideName?.trim()) {
    return resolveCoasterWikipediaSummary({
      rideName: options.rideName,
      parkName: options.parkName,
      enwikiTitle: storedTitle,
      wikidataId: options.wikidataId,
    });
  }

  let title = storedTitle;
  if (!title && options.wikidataId?.trim()) {
    title = await fetchEnwikiTitleFromWikidata(options.wikidataId);
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
