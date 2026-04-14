/**
 * Parse English Wikipedia {{Infobox roller coaster}} wikitext for numeric stats.
 * Used as a fallback when Wikidata rows lack measurements. Does not scrape HTML —
 * callers should use the MediaWiki API (action=query&prop=revisions) to fetch wikitext.
 */

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
};

/** Extract `{{Infobox roller coaster … }}` including nested templates. */
function extractInfoboxRollerCoasterBlock(wikitext: string): string | null {
  const re = /\{\{\s*[Ii]nfobox\s+roller\s+coaster\b/;
  const m = re.exec(wikitext);
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

/**
 * Read stats from full page wikitext. Returns partial object; only include fields present in infobox.
 */
function parseInfoboxCoasterStatsFromWikitext(wikitext: string): InfoboxCoasterStats {
  const block = extractInfoboxRollerCoasterBlock(wikitext);
  if (!block) return {};
  const p = parseParamsFromBlock(block);
  const out: InfoboxCoasterStats = {};

  const lf = p.get("length_ft") ?? p.get("length");
  if (lf) {
    const n = firstNumberFromConvertOrPlain(lf, "ft");
    if (n != null) out.length_ft = n;
  }

  const hf = p.get("height_ft") ?? p.get("height");
  if (hf) {
    const n = firstNumberFromConvertOrPlain(hf, "ft");
    if (n != null) out.height_ft = n;
  }

  const sp = p.get("speed_mph") ?? p.get("speed");
  if (sp) {
    const n = firstNumberFromConvertOrPlain(sp, "mph");
    if (n != null) out.speed_mph = n;
  }

  const inv = p.get("inversions");
  if (inv) {
    const stripped = inv.replace(/\{\{[^}]*\}\}/g, "").trim();
    // Reject values like "2:28" (duration leak) or "2 trains" (only a leading digit would wrongly match).
    const m = /^(\d{1,2})\s*$/.exec(stripped);
    if (m) out.inversions = parseInt(m[1], 10);
  }

  const dur = p.get("duration");
  if (dur) {
    const s = parseDurationSecondsFromText(dur);
    if (s != null) out.duration_s = s;
  }

  return out;
}

type WikiQueryResponse = {
  query?: {
    pages?: Record<
      string,
      {
        missing?: boolean;
        revisions?: Array<{
          slots?: { main?: { content?: string } };
          content?: string;
        }>;
      }
    >;
  };
};

function revisionWikitext(json: WikiQueryResponse): string | null {
  const pages = json.query?.pages;
  if (!pages) return null;
  for (const page of Object.values(pages)) {
    if (page.missing) continue;
    const r = page.revisions?.[0];
    if (!r) continue;
    const fromSlot = r.slots?.main?.content;
    if (typeof fromSlot === "string") return fromSlot;
    const legacy = (r as { content?: string }).content;
    if (typeof legacy === "string") return legacy;
  }
  return null;
}

/**
 * Fetch main-slot wikitext for an English Wikipedia article title (with redirects followed).
 */
async function fetchEnwikiWikitext(title: string): Promise<string | null> {
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

export async function fetchInfoboxStatsForEnwikiTitle(title: string): Promise<InfoboxCoasterStats | null> {
  const wt = await fetchEnwikiWikitext(title);
  if (!wt) return null;
  const stats = parseInfoboxCoasterStatsFromWikitext(wt);
  return Object.keys(stats).length > 0 ? stats : null;
}
