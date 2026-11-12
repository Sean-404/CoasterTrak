/**
 * Photographer and licence credits for Wikimedia Commons photos.
 *
 * Catalog photos come from Wikidata (P18) and Wikipedia lead images, which live on Commons
 * under licences such as CC BY-SA that require the author, the licence and a link wherever the
 * photo is shown. A link to the Wikipedia article is not that credit.
 */

const COMMONS_USER_AGENT = "CoasterTrak/0.1 (roller coaster catalog; https://coastertrak.com/)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Credits rarely change; a month keeps Commons traffic negligible. */
const CREDIT_REVALIDATE_SECONDS = 60 * 60 * 24 * 30;
const MAX_AUTHOR_CHARS = 120;

export type PhotoCredit = {
  /** Plain-text author, or null when Commons lists none (e.g. public domain). */
  author: string | null;
  /** Short licence name, e.g. "CC BY-SA 4.0" or "Public domain". */
  license: string | null;
  licenseUrl: string | null;
  /** The file's Commons page, which carries the full attribution. */
  sourceUrl: string;
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeFileName(raw: string): string | null {
  const name = safeDecode(raw).replace(/^File:/i, "").replace(/_/g, " ").trim();
  return name ? name : null;
}

/**
 * The Commons file name behind a photo URL, or null when the URL is not a Commons file.
 * Handles Special:FilePath links, File: pages, and upload.wikimedia.org originals and thumbs.
 */
export function commonsFileName(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (host === "commons.wikimedia.org") {
    const filePath = path.match(/^\/wiki\/Special:FilePath\/(.+)$/i);
    if (filePath) return normalizeFileName(filePath[1]);
    const filePage = path.match(/^\/wiki\/(File:.+)$/i);
    if (filePage) return normalizeFileName(filePage[1]);
    return null;
  }

  if (host === "upload.wikimedia.org") {
    // /wikipedia/commons/thumb/a/ab/Name.jpg/320px-Name.jpg
    const thumb = path.match(/^\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//i);
    if (thumb) return normalizeFileName(thumb[1]);
    // /wikipedia/commons/a/ab/Name.jpg
    const original = path.match(/^\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)$/i);
    if (original) return normalizeFileName(original[1]);
  }
  return null;
}

/**
 * Photos uploaded to a single Wikipedia (upload.wikimedia.org/wikipedia/en/…) rather than
 * Commons. Those are usually non-free files used under that wiki's fair-use rules, which do
 * not extend to CoasterTrak, so they must not be shown.
 */
export function isLocalWikiUpload(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.toLowerCase() !== "upload.wikimedia.org") return false;
    const project = parsed.pathname.match(/^\/[^/]+\/([^/]+)\//)?.[1]?.toLowerCase();
    return Boolean(project) && project !== "commons";
  } catch {
    return false;
  }
}

export function commonsFilePageUrl(fileName: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replace(/ /g, "_"))}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Commons returns Artist as HTML (links, spans, line breaks); keep only the readable text. */
export function plainTextFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      const lower = code.toLowerCase();
      if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
      return NAMED_ENTITIES[lower] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > MAX_AUTHOR_CHARS ? `${text.slice(0, MAX_AUTHOR_CHARS - 1).trimEnd()}…` : text;
}

type ExtMetadataField = { value?: unknown };
type ExtMetadata = Partial<Record<"Artist" | "LicenseShortName" | "LicenseUrl", ExtMetadataField>>;

function fieldText(field: ExtMetadataField | undefined): string | null {
  return typeof field?.value === "string" ? field.value : null;
}

/** Build a credit from the Commons imageinfo extmetadata block. */
export function creditFromExtMetadata(fileName: string, meta: ExtMetadata | null | undefined): PhotoCredit {
  const licenseUrl = fieldText(meta?.LicenseUrl)?.trim() || null;
  return {
    author: plainTextFromHtml(fieldText(meta?.Artist)),
    license: plainTextFromHtml(fieldText(meta?.LicenseShortName)),
    licenseUrl: licenseUrl && /^https?:\/\//i.test(licenseUrl) ? licenseUrl : null,
    sourceUrl: commonsFilePageUrl(fileName),
  };
}

/**
 * Look up the author and licence for a Commons photo URL. Returns null for photos that are
 * not on Commons; when Commons cannot be reached, still returns the file page link so the
 * photo is never shown without a route to its attribution.
 */
export async function fetchCommonsCredit(imageUrl: string | null | undefined): Promise<PhotoCredit | null> {
  const fileName = commonsFileName(imageUrl);
  if (!fileName) return null;
  const fallback: PhotoCredit = {
    author: null,
    license: null,
    licenseUrl: null,
    sourceUrl: commonsFilePageUrl(fileName),
  };

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "extmetadata",
    iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
    titles: `File:${fileName}`,
  });

  try {
    const res = await fetch(`${COMMONS_API}?${params}`, {
      headers: { "User-Agent": COMMONS_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: CREDIT_REVALIDATE_SECONDS },
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      query?: { pages?: Array<{ missing?: boolean; imageinfo?: Array<{ extmetadata?: ExtMetadata }> }> };
    };
    const page = data.query?.pages?.[0];
    if (!page || page.missing) return fallback;
    return creditFromExtMetadata(fileName, page.imageinfo?.[0]?.extmetadata);
  } catch {
    return fallback;
  }
}
