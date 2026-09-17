/**
 * Parse English Wikipedia roller-coaster infobox wikitext for catalog fields.
 * Supports `{{Infobox roller coaster}}` and `{{Infobox dual roller coaster}}`.
 * Does not scrape HTML — uses MediaWiki API revisions.
 */

import { normalizeManufacturerLabel } from "@/lib/display";
import {
  parseDurationSecondsFromText,
  WIKIDATA_USER_AGENT,
} from "@/lib/wikidata-coasters";

export type InfoboxCoasterStats = {
  length_ft?: number;
  height_ft?: number;
  speed_mph?: number;
  inversions?: number;
  duration_s?: number;
  manufacturer?: string;
  coaster_type?: string;
  opening_year?: number;
};

/** One park installation from a roller-coaster infobox or `/extend` block. */
export type InfoboxCoasterLocation = {
  name?: string;
  parkName: string;
  status: "Operating" | "Defunct" | "Unknown";
  opening_year?: number;
  closing_year?: number;
  rcdb_id?: string;
};

const INFOBOX_START_RE =
  /\{\{\s*[Ii]nfobox\s+(?:dual\s+)?roller\s+coaster(?:\s*\/\s*extend|\s+extend)?\b/g;

function extractBalancedTemplate(wikitext: string, start: number): string | null {
  let i = start;
  let depth = 0;
  while (i < wikitext.length - 1) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
      depth++;
      i += 2;
      continue;
    }
    if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
      depth--;
      i += 2;
      if (depth === 0) return wikitext.slice(start, i);
      continue;
    }
    i++;
  }
  return null;
}

/** Extract the first roller-coaster infobox block, including nested templates. */
export function extractInfoboxRollerCoasterBlock(wikitext: string): string | null {
  INFOBOX_START_RE.lastIndex = 0;
  const m = INFOBOX_START_RE.exec(wikitext);
  if (!m) return null;
  return extractBalancedTemplate(wikitext, m.index);
}

/** Every infobox / extend block (mirror copies and relocations). */
export function extractAllInfoboxRollerCoasterBlocks(wikitext: string): string[] {
  const blocks: string[] = [];
  const seen = new Set<number>();
  const re = new RegExp(INFOBOX_START_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext))) {
    if (seen.has(m.index)) continue;
    seen.add(m.index);
    const block = extractBalancedTemplate(wikitext, m.index);
    if (block) blocks.push(block);
  }
  return blocks;
}

/** Split template body on `|` only at nesting depth 0 (outside `{{…}}`). */
function splitTopLevelPipes(body: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{" && body[i + 1] === "{") {
      depth++;
      cur += "{{";
      i++;
      continue;
    }
    if (ch === "}" && body[i + 1] === "}") {
      depth--;
      cur += "}}";
      i++;
      continue;
    }
    if (ch === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function firstNumberFromConvertOrPlain(val: string, kind: "ft" | "mph" | "any"): number | null {
  const t = val.trim();
  const cv = /\{\{\s*[Cc]onvert\|([^|]+)\|([^|}]+)/.exec(t);
  if (cv) {
    const num = parseFloat(cv[1].replace(/,/g, ""));
    const u = cv[2].trim().toLowerCase();
    if (!Number.isFinite(num)) return null;
    if (kind === "ft") {
      if (u.startsWith("ft")) return Math.round(num);
      if (u.startsWith("m") && !u.includes("mi")) return Math.round(num * 3.28084);
    }
    if (kind === "mph") {
      if (u.startsWith("mph")) return Math.round(num);
      if (u.startsWith("km")) return Math.round(num * 0.621371);
    }
    if (kind === "any") {
      if (u.startsWith("ft")) return Math.round(num);
      if (u.startsWith("m") && !u.includes("mi")) return Math.round(num * 3.28084);
      if (u.startsWith("mph")) return Math.round(num);
      if (u.startsWith("km")) return Math.round(num * 0.621371);
    }
  }
  const plain = /^([\d,.]+)\s*(ft|m|mph|km\/h)?/i.exec(t.replace(/,/g, ""));
  if (!plain) return null;
  const num = parseFloat(plain[1]);
  if (!Number.isFinite(num)) return null;
  const u = (plain[2] ?? "").toLowerCase();
  if (kind === "ft") {
    if (u === "m") return Math.round(num * 3.28084);
    return Math.round(num);
  }
  if (kind === "mph") {
    if (u.startsWith("km")) return Math.round(num * 0.621371);
    return Math.round(num);
  }
  return Math.round(num);
}

function parseParamsFromBlock(block: string): Map<string, string> {
  const inner = block.slice(2, -2);
  const parts = splitTopLevelPipes(inner);
  const map = new Map<string, string>();
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase().replace(/\s+/g, "_");
    const val = part.slice(eq + 1).trim();
    if (key && !key.startsWith("infobox")) map.set(key, val);
  }
  return map;
}

function pickParam(p: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = p.get(key);
    if (v?.trim()) return v;
  }
  return undefined;
}

/** Strip wiki markup from an infobox cell for display fields. */
export function cleanInfoboxWikiValue(val: string): string {
  return val
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Wikitable pipe escapes used in multi-install manufacturer cells.
    .replace(/\{\{!\}\}/gi, "|")
    .replace(/\{\{[!()]+!\}\}/gi, " ")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Park names from infobox `location=` — strip leftover wikilink junk. */
export function cleanInfoboxParkName(raw: string): string {
  let t = cleanInfoboxWikiValue(raw);
  t = t.replace(/\[\[|\]\]/g, "").trim();
  if (t.includes("|")) {
    t = (t.split("|").pop() ?? t).trim();
  }
  return t;
}

const COUNTRY_ONLY_LOCATION =
  /^(united states|usa|u\.s\.a?\.?|united kingdom|uk|germany|france|spain|italy|japan|china|canada|mexico|australia|netherlands|belgium|austria|switzerland|sweden|norway|denmark|finland|poland|russia|india|brazil|south korea|north korea|taiwan|hong kong|macau)$/i;

export function isCountryOnlyInfoboxLocation(name: string): boolean {
  return COUNTRY_ONLY_LOCATION.test(name.trim());
}

function parseCoasterType(raw: string): string | undefined {
  const cleaned = cleanInfoboxWikiValue(raw);
  const m = /\b(steel|wood|wooden|hybrid)\b/i.exec(cleaned);
  if (!m) return undefined;
  const t = m[1].toLowerCase();
  if (t === "wood" || t === "wooden") return "Wood";
  if (t === "hybrid") return "Hybrid";
  return "Steel";
}

function parseManufacturer(raw: string): string | undefined {
  const cleaned = cleanInfoboxWikiValue(raw);
  const normalized = normalizeManufacturerLabel(cleaned);
  if (!normalized) return undefined;
  // Multi-install Wikipedia pages sometimes list every park's builder in one cell —
  // keep those usable, but drop empty/noise.
  if (normalized.length > 160) return undefined;
  return normalized;
}

/**
 * Read stats + type/manufacturer from full page wikitext.
 * Returns a partial object; only include fields present in the infobox.
 */
export function parseInfoboxCoasterStatsFromWikitext(wikitext: string): InfoboxCoasterStats {
  const block = extractInfoboxRollerCoasterBlock(wikitext);
  if (!block) return {};
  const p = parseParamsFromBlock(block);
  const out: InfoboxCoasterStats = {};

  const lf = pickParam(p, ["length_ft", "length", "length1_ft", "length1"]);
  if (lf) {
    const n = firstNumberFromConvertOrPlain(lf, "ft");
    if (n != null) out.length_ft = n;
  }

  const hf = pickParam(p, ["height_ft", "height", "height1_ft", "height1"]);
  if (hf) {
    const n = firstNumberFromConvertOrPlain(hf, "ft");
    if (n != null) out.height_ft = n;
  }

  const sp = pickParam(p, ["speed_mph", "speed", "speed1_mph", "speed1"]);
  if (sp) {
    const n = firstNumberFromConvertOrPlain(sp, "mph");
    if (n != null) out.speed_mph = n;
  }

  const inv = pickParam(p, ["inversions", "inversions1"]);
  if (inv) {
    const stripped = cleanInfoboxWikiValue(inv);
    const m = /^(\d{1,2})\s*$/.exec(stripped);
    if (m) out.inversions = parseInt(m[1], 10);
  }

  const dur = pickParam(p, ["duration", "duration1"]);
  if (dur) {
    const s = parseDurationSecondsFromText(dur);
    if (s != null) out.duration_s = s;
  }

  const manufacturer = pickParam(p, ["manufacturer", "builder"]);
  if (manufacturer) {
    const mfr = parseManufacturer(manufacturer);
    if (mfr) out.manufacturer = mfr;
  }

  const typeRaw = pickParam(p, ["type", "coaster_type"]);
  if (typeRaw) {
    const ct = parseCoasterType(typeRaw);
    if (ct) out.coaster_type = ct;
  }

  const openedRaw = pickParam(p, ["opened", "year", "opened_date", "opened1", "open"]);
  if (openedRaw) {
    const year = parseOpeningYear(openedRaw);
    if (year != null) out.opening_year = year;
  }

  return out;
}

function yearFromInfoboxDate(raw: string): number | null {
  const t = cleanInfoboxWikiValue(raw);
  const tpl =
    /\{\{\s*(?:[Ss]tart|[Ee]nd)\s*date\s*\|(\d{4})\b/.exec(raw) ??
    /\{\{\s*(?:[Ss]tart|[Ee]nd)\s*date\s*\|(\d{4})\b/.exec(t);
  if (tpl) {
    const y = Number(tpl[1]);
    if (y >= 1880 && y <= 2100) return y;
  }
  const yearOnly = /\b(18\d{2}|19\d{2}|20\d{2})\b/.exec(t);
  if (!yearOnly) return null;
  const y = Number(yearOnly[1]);
  return y >= 1880 && y <= 2100 ? y : null;
}

/** Extract a plausible opening year from Wikipedia infobox date text / templates. */
export function parseOpeningYear(raw: string): number | null {
  return yearFromInfoboxDate(raw);
}

/** Extract a plausible closing year from Wikipedia infobox date text / templates. */
export function parseClosingYear(raw: string): number | null {
  return yearFromInfoboxDate(raw);
}

/**
 * Infobox `status=` is a park-install lifecycle (Operating / Closed / Removed),
 * not seasonal downtime.
 */
export function infoboxLocationStatus(raw: string): InfoboxCoasterLocation["status"] {
  const t = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return "Unknown";
  if (/\boperating\b/.test(t) || t === "open") return "Operating";
  if (
    /\brelocated to\b/.test(t) ||
    /\bremoved\b/.test(t) ||
    /\bclosed\b/.test(t) ||
    /\bdefunct\b/.test(t) ||
    /\bsbno\b/.test(t)
  ) {
    return "Defunct";
  }
  return "Unknown";
}

function rcdbIdFromParam(raw: string): string | undefined {
  const digits = raw.match(/\b(\d{2,6})\b/);
  return digits?.[1];
}

function locationFromBlock(block: string): InfoboxCoasterLocation | null {
  const p = parseParamsFromBlock(block);
  const parkRaw = pickParam(p, ["location"]);
  const parkName = parkRaw ? cleanInfoboxParkName(parkRaw) : "";
  if (!parkName || isCountryOnlyInfoboxLocation(parkName)) return null;

  const nameRaw = pickParam(p, ["altname", "name"]);
  const statusRaw = pickParam(p, ["status"]);
  const openedRaw = pickParam(p, ["opened", "year", "opened_date", "opened1", "open"]);
  const closedRaw = pickParam(p, ["closed", "closing_date", "closed1"]);
  const rcdbRaw = pickParam(p, ["rcdb_number", "location_rcdb_number"]);

  const out: InfoboxCoasterLocation = {
    parkName,
    status: statusRaw ? infoboxLocationStatus(statusRaw) : "Unknown",
  };
  if (nameRaw) {
    const name = cleanInfoboxWikiValue(nameRaw);
    if (name) out.name = name;
  }
  if (openedRaw) {
    const y = parseOpeningYear(openedRaw);
    if (y != null) out.opening_year = y;
  }
  if (closedRaw) {
    const y = parseClosingYear(closedRaw);
    if (y != null) out.closing_year = y;
  }
  if (rcdbRaw) {
    const id = rcdbIdFromParam(rcdbRaw);
    if (id) out.rcdb_id = id;
  }
  return out;
}

/**
 * Park installations listed on a Wikipedia article (primary infobox + extend copies).
 * Unique Wikidata binding can only keep one of these in the catalog — extra parks
 * must be inserted as sibling rows without sharing the Q-id.
 */
export function parseInfoboxCoasterLocationsFromWikitext(
  wikitext: string,
): InfoboxCoasterLocation[] {
  const seenParks = new Set<string>();
  const out: InfoboxCoasterLocation[] = [];
  for (const block of extractAllInfoboxRollerCoasterBlocks(wikitext)) {
    const loc = locationFromBlock(block);
    if (!loc) continue;
    const key = loc.parkName.trim().toLowerCase();
    if (seenParks.has(key)) continue;
    seenParks.add(key);
    out.push(loc);
  }
  return out;
}

type WikiPage = {
  missing?: boolean;
  revisions?: Array<{
    slots?: { main?: { content?: string } };
    content?: string;
  }>;
};

type WikiQueryResponse = {
  query?: {
    pages?: WikiPage[] | Record<string, WikiPage>;
  };
};

function revisionWikitext(json: WikiQueryResponse): string | null {
  const pages = json.query?.pages;
  if (!pages) return null;
  const list = Array.isArray(pages) ? pages : Object.values(pages);
  for (const page of list) {
    if (page.missing) continue;
    const r = page.revisions?.[0];
    if (!r) continue;
    const fromSlot = r.slots?.main?.content;
    if (typeof fromSlot === "string") return fromSlot;
    if (typeof r.content === "string") return r.content;
  }
  return null;
}

/**
 * Fetch main-slot wikitext for an English Wikipedia article title (with redirects followed).
 */
export async function fetchEnwikiWikitext(title: string): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("titles", title);
  url.searchParams.set("redirects", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": WIKIDATA_USER_AGENT },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as WikiQueryResponse;
  return revisionWikitext(json);
}

export async function fetchInfoboxStatsForEnwikiTitle(
  title: string,
): Promise<InfoboxCoasterStats | null> {
  const wt = await fetchEnwikiWikitext(title);
  if (!wt) return null;
  const stats = parseInfoboxCoasterStatsFromWikitext(wt);
  return Object.keys(stats).length > 0 ? stats : null;
}

type EmbeddedInResponse = {
  continue?: { eicontinue?: string };
  query?: { embeddedin?: Array<{ title?: string }> };
};

function mediaWikiApiUrl(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  // MediaWiki treats `%2F` in titles as a different page than `/` (subpages).
  return `https://en.wikipedia.org/w/api.php?${search.toString().replace(/%2F/gi, "/")}`;
}

/**
 * Article titles that transclude a template (main namespace only).
 * Used to find Wikipedia `/extend` clone / relocation infoboxes.
 */
export async function listPagesEmbeddingTemplate(templateTitle: string): Promise<string[]> {
  const titles: string[] = [];
  let eicontinue: string | undefined;
  let retries = 0;
  do {
    const params: Record<string, string> = {
      action: "query",
      format: "json",
      formatversion: "2",
      list: "embeddedin",
      eititle: templateTitle,
      einamespace: "0",
      eilimit: "500",
    };
    if (eicontinue) params.eicontinue = eicontinue;

    const res = await fetch(mediaWikiApiUrl(params), {
      headers: { "User-Agent": WIKIDATA_USER_AGENT },
    });
    if (res.status === 429 && retries < 4) {
      retries += 1;
      await new Promise((r) => setTimeout(r, 4000 * retries));
      continue;
    }
    if (!res.ok) break;
    retries = 0;
    const json = (await res.json()) as EmbeddedInResponse;
    for (const row of json.query?.embeddedin ?? []) {
      if (row.title?.trim()) titles.push(row.title.trim());
    }
    eicontinue = json.continue?.eicontinue;
  } while (eicontinue);

  return titles;
}

/** Wikipedia articles that list more than one park via infobox extend. */
export async function listRollerCoasterExtendArticleTitles(): Promise<string[]> {
  const slash = await listPagesEmbeddingTemplate("Template:Infobox roller coaster/extend");
  const slashless = await listPagesEmbeddingTemplate("Template:Infobox roller coaster extend");
  return [...new Set([...slash, ...slashless])].sort((a, b) => a.localeCompare(b));
}
