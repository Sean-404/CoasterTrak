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
};

const INFOBOX_START_RE =
  /\{\{\s*[Ii]nfobox\s+(?:dual\s+)?roller\s+coaster\b/;

/** Extract the first roller-coaster infobox block, including nested templates. */
export function extractInfoboxRollerCoasterBlock(wikitext: string): string | null {
  const m = INFOBOX_START_RE.exec(wikitext);
  if (!m) return null;
  let i = m.index;
  let depth = 0;
  const start = i;
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
