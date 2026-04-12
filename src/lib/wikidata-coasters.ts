/**
 * Fetch roller coaster metadata from Wikidata (SPARQL) and normalize fields
 * for CoasterTrak. Uses WikiProject Roller Coasters class hierarchy (Q204832).
 */

import { cleanCoasterName } from "./display";

export const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/** Compliant with https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy */
export const WIKIDATA_USER_AGENT =
  "CoasterTrak/0.1 (roller coaster catalog sync; https://github.com/)";

/**
 * Full SPARQL: instances of roller coaster or any subclass of Q204832.
 * Second hop on P361 uses direct P31 only (no wdt:P279* — that path timed out WDQS on full runs).
 * Q2416723 = theme park, Q3363942 = amusement park; exclude Q875912 = resort.
 */
export const ROLLER_COASTER_SPARQL = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>

SELECT ?item ?itemLabel ?coord ?countryLabel ?parkLabel ?manufacturerLabel
  ?clsLabel
  ?lengthM ?speedMs ?heightM ?durationS
  ?opening ?retirement ?demolished ?rcdbId ?enwiki
  ?park ?parkParent
WHERE {
  ?item wdt:P31 ?cls .
  ?cls wdt:P279* wd:Q204832 .
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P361 ?park . }
  OPTIONAL {
    ?park wdt:P361 ?parkParent .
    FILTER(
      EXISTS { ?parkParent wdt:P31 wd:Q2416723 . }
      || EXISTS { ?parkParent wdt:P31 wd:Q3363942 . }
    )
    FILTER( NOT EXISTS { ?parkParent wdt:P31 wd:Q875912 . } )
  }
  OPTIONAL { ?item wdt:P176 ?manufacturer . }
  OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?lengthM . }
  OPTIONAL { ?item p:P2052/psn:P2052/wikibase:quantityAmount ?speedMs . }
  OPTIONAL { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?heightM . }
  OPTIONAL { ?item p:P2047/psn:P2047/wikibase:quantityAmount ?durationS . }
  OPTIONAL { ?item wdt:P1619 ?opening . }
  OPTIONAL { ?item wdt:P730 ?retirement . }
  OPTIONAL { ?item wdt:P576 ?demolished . }
  OPTIONAL { ?item wdt:P2751 ?rcdbId . }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?enwiki .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;

export type SparqlJsonBinding = {
  type: "uri" | "literal" | "bnode";
  value: string;
  datatype?: string;
  "xml:lang"?: string;
};

export type SparqlJsonResponse = {
  results: { bindings: Record<string, SparqlJsonBinding>[] };
};

export function parseWktPoint(wkt: string | undefined): {
  lat: number;
  lon: number;
} | null {
  if (!wkt) return null;
  const m = /^Point\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/.exec(wkt.trim());
  if (!m) return null;
  const lon = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

export function parseUriToQid(uri: string): string {
  const last = uri.split("/").pop() ?? uri;
  return last.startsWith("Q") ? last : uri;
}

function bindingLiteral(b: SparqlJsonBinding | undefined): string | null {
  if (!b || b.type !== "literal") return null;
  return b.value;
}

function bindingUri(b: SparqlJsonBinding | undefined): string | null {
  if (!b || b.type !== "uri") return null;
  return b.value;
}

function bindingNumber(b: SparqlJsonBinding | undefined): number | null {
  const v = bindingLiteral(b);
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Wikidata time: +1990-03-17T00:00:00Z (or year-precision +1990-00-00...) */
export function parseWikidataTime(s: string | undefined): string | null {
  if (!s) return null;
  const full = /^([+-]\d{4}-\d{2}-\d{2})/.exec(s);
  if (full) return full[1].replace(/^\+/, "");
  const yonly = /^([+-]\d{4})-00-00/.exec(s);
  if (yonly) return `${yonly[1].replace(/^\+/, "")}-01-01`;
  return null;
}

export type WikidataCoasterRow = {
  wikidataId: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  countryLabel: string | null;
  parkLabel: string | null;
  manufacturerLabel: string | null;
  lengthM: number | null;
  speedMs: number | null;
  heightM: number | null;
  durationS: number | null;
  openingDate: string | null;
  retirementDate: string | null;
  demolishedDate: string | null;
  rcdbId: string | null;
  enwikiTitle: string | null;
  status: "operating" | "defunct" | "unknown";
  /** Human-readable derived stats */
  speedMph: number | null;
  lengthFt: number | null;
  heightFt: number | null;
  /** Wikidata P31 class label, e.g. "wooden roller coaster", "steel roller coaster" */
  coasterTypeLabel: string | null;
  /** Filled by Wikipedia infobox enrichment (rare on Wikidata) */
  inversions: number | null;
};

function inferStatus(
  opening: string | null,
  retirement: string | null,
  demolished: string | null,
): "operating" | "defunct" | "unknown" {
  const now = new Date();
  const end =
    demolished || retirement
      ? new Date(demolished || retirement || "")
      : null;
  if (end && !Number.isNaN(end.getTime()) && end < now) return "defunct";
  if (opening) {
    const o = new Date(opening);
    if (!Number.isNaN(o.getTime()) && o > now) return "unknown";
    return "operating";
  }
  if (demolished || retirement) return "defunct";
  return "unknown";
}

export function bindingsToRow(
  b: Record<string, SparqlJsonBinding>,
): WikidataCoasterRow | null {
  const itemUri = bindingUri(b.item);
  if (!itemUri) return null;
  const wikidataId = parseUriToQid(itemUri);
  const label = bindingLiteral(b.itemLabel) ?? wikidataId;
  const wkt = bindingLiteral(b.coord);
  const geo = parseWktPoint(wkt ?? undefined);

  const openingRaw = bindingLiteral(b.opening);
  const retirementRaw = bindingLiteral(b.retirement);
  const demolishedRaw = bindingLiteral(b.demolished);

  const openingDate = parseWikidataTime(openingRaw ?? undefined);
  const retirementDate = parseWikidataTime(retirementRaw ?? undefined);
  const demolishedDate = parseWikidataTime(demolishedRaw ?? undefined);

  const lengthM = bindingNumber(b.lengthM);
  const speedMs = bindingNumber(b.speedMs);
  const heightM = bindingNumber(b.heightM);
  const durationS = bindingNumber(b.durationS);

  const status = inferStatus(
    openingDate,
    retirementDate,
    demolishedDate,
  );

  const speedMph = speedMs != null ? speedMs * 2.23693629 : null;
  const lengthFt = lengthM != null ? lengthM * 3.28084 : null;
  const heightFt = heightM != null ? heightM * 3.28084 : null;

  /** Immediate P361 (e.g. themed land) vs parent gate (amusement park), from Wikidata ontology — not app-specific. */
  const immediateParkLabel = bindingLiteral(b.parkLabel) ?? null;
  const parentParkLabel = bindingLiteral(b.parkParentLabel) ?? null;
  const resolvedParkLabel = parentParkLabel ?? immediateParkLabel;

  return {
    wikidataId,
    label,
    latitude: geo?.lat ?? null,
    longitude: geo?.lon ?? null,
    countryLabel: bindingLiteral(b.countryLabel) ?? null,
    parkLabel: resolvedParkLabel,
    manufacturerLabel: bindingLiteral(b.manufacturerLabel) ?? null,
    lengthM,
    speedMs,
    heightM,
    durationS,
    openingDate,
    retirementDate,
    demolishedDate,
    rcdbId: bindingLiteral(b.rcdbId),
    enwikiTitle: bindingLiteral(b.enwiki),
    status,
    speedMph,
    lengthFt,
    heightFt,
    coasterTypeLabel: bindingLiteral(b.clsLabel) ?? null,
    inversions: null,
  };
}

function mergeTwoRows(
  a: WikidataCoasterRow,
  b: WikidataCoasterRow,
): WikidataCoasterRow {
  const merged = { ...a };
  const keys = Object.keys(b) as (keyof WikidataCoasterRow)[];
  for (const k of keys) {
    const av = merged[k];
    const bv = b[k];
    const empty =
      av === null ||
      av === undefined ||
      (typeof av === "string" && av === "");
    if (empty && bv != null && bv !== "") {
      (merged as Record<string, unknown>)[k] = bv;
    }
  }
  merged.status = inferStatus(
    merged.openingDate,
    merged.retirementDate,
    merged.demolishedDate,
  );
  return merged;
}

/** Merge rows that share the same Q-id (duplicate OPTIONALs). */
export function mergeRowsByItem(rows: WikidataCoasterRow[]): WikidataCoasterRow[] {
  const map = new Map<string, WikidataCoasterRow>();
  for (const r of rows) {
    const prev = map.get(r.wikidataId);
    if (!prev) {
      map.set(r.wikidataId, { ...r });
      continue;
    }
    map.set(r.wikidataId, mergeTwoRows(prev, r));
  }
  return [...map.values()];
}

/** WDQS allows a longer server-side cap via query string (ms); anonymous limit may still apply. */
const WDQS_SPARQL_URL = `${WIKIDATA_SPARQL_ENDPOINT}?format=json&timeout=300000`;

export async function fetchWikidataSparqlPage(
  query: string,
  offset: number,
  limit: number,
  retries = 7,
): Promise<SparqlJsonResponse> {
  const q = `${query.trim()}\nORDER BY ?item\nLIMIT ${limit}\nOFFSET ${offset}\n`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(WDQS_SPARQL_URL, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/sparql-query",
        "User-Agent": WIKIDATA_USER_AGENT,
      },
      body: q,
    });

    if (res.ok) return res.json() as Promise<SparqlJsonResponse>;

    const isTransient = res.status === 429 || res.status >= 500;
    if (!isTransient || attempt === retries) {
      const text = await res.text();
      throw new Error(`Wikidata SPARQL ${res.status}: ${text.slice(0, 500)}`);
    }

    const is504 = res.status === 504;
    const delay =
      res.status === 429
        ? 12_000
        : is504
          ? Math.min(8_000 * 2 ** attempt, 90_000)
          : Math.min(3_000 * 2 ** attempt, 45_000);
    console.error(
      `  Wikidata ${res.status} on offset ${offset}, retry ${attempt + 1}/${retries} in ${delay / 1000}s…`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }

  throw new Error("Unreachable");
}

export async function fetchAllRollerCoasters(options?: {
  pageSize?: number;
  maxRows?: number;
  onPage?: (page: WikidataCoasterRow[], offset: number) => void | Promise<void>;
  delayMs?: number;
}): Promise<WikidataCoasterRow[]> {
  /** Smaller pages avoid WDQS 504s on heavy OPTIONALs; override via options. */
  const pageSize = options?.pageSize ?? 2000;
  const maxRows = options?.maxRows ?? Infinity;
  const delayMs = options?.delayMs ?? 2000;

  const out: WikidataCoasterRow[] = [];
  let offset = 0;

  for (;;) {
    const json = await fetchWikidataSparqlPage(
      ROLLER_COASTER_SPARQL,
      offset,
      pageSize,
    );
    const bindings = json.results?.bindings ?? [];
    if (bindings.length === 0) break;

    const pageRows: WikidataCoasterRow[] = [];
    for (const b of bindings) {
      const row = bindingsToRow(b);
      if (row) pageRows.push(row);
    }
    const merged = mergeRowsByItem(pageRows);
    out.push(...merged);
    if (options?.onPage) await options.onPage(merged, offset);

    const uniqueSoFar = mergeRowsByItem(out);
    if (uniqueSoFar.length >= maxRows) break;
    if (bindings.length < pageSize) break;
    offset += pageSize;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  const unique = mergeRowsByItem(out);
  if (maxRows < Infinity && unique.length > maxRows) {
    return unique.slice(0, maxRows);
  }
  return unique;
}

/** Strip thousand-separating commas from a numeric string (e.g. "6,072" → 6072). */
function stripCommas(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

/** Parse human-readable length/speed/G strings from infoboxes or prose. */
export function parseLengthMetersFromText(s: string): number | null {
  const t = s.replace(/\u00a0/g, " ").trim();
  const mFt = /([\d,]+(?:\.\d+)?)\s*(?:ft|foot|feet)\b/i.exec(t);
  if (mFt) return stripCommas(mFt[1]) * 0.3048;
  const mM = /([\d,]+(?:\.\d+)?)\s*m(?:\s|\)|$|,)/i.exec(t);
  if (mM) return stripCommas(mM[1]);
  const mMi = /([\d,]+(?:\.\d+)?)\s*mi\b/i.exec(t);
  if (mMi) return stripCommas(mMi[1]) * 1609.34;
  return null;
}

export function parseSpeedMphFromText(s: string): number | null {
  const t = s.replace(/\u00a0/g, " ").trim();
  const mph = /([\d,]+(?:\.\d+)?)\s*mph/i.exec(t);
  if (mph) return stripCommas(mph[1]);
  const kmh = /([\d,]+(?:\.\d+)?)\s*km\/h/i.exec(t);
  if (kmh) return stripCommas(kmh[1]) * 0.621371;
  return null;
}

export function parseGForceFromText(s: string): number | null {
  const t = s.replace(/\u00a0/g, " ").trim();
  const range = /([\d.]+)\s*(?:-|–|to)\s*([\d.]+)/i.exec(t);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  const g = /([\d.]+)\s*g\b/i.exec(t);
  if (g) return parseFloat(g[1]);
  return null;
}

export function parseInversionsFromText(s: string): number | null {
  const t = s.replace(/\u00a0/g, " ").trim();
  const n = /^(\d+)\s*$/.exec(t);
  if (n) return parseInt(n[1], 10);
  const w = /(\d+)\s*(?:inversion|element)/i.exec(t);
  if (w) return parseInt(w[1], 10);
  return null;
}

/** Parse ride duration from Wikipedia infobox: "2:15", "1:30", "135 seconds", "3 minutes". → seconds */
export function parseDurationSecondsFromText(s: string): number | null {
  const t = s.replace(/\u00a0/g, " ").trim();
  if (!t) return null;
  // mm:ss (most common for coasters)
  const colon = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (colon) {
    const p0 = parseInt(colon[1], 10);
    const p1 = parseInt(colon[2], 10);
    const p2 = colon[3] ? parseInt(colon[3], 10) : null;
    if (p2 != null) return p0 * 3600 + p1 * 60 + p2;
    return p0 * 60 + p1;
  }
  const lower = t.toLowerCase();
  const sec = /([\d.]+)\s*(?:seconds?|secs?)\b/.exec(lower);
  if (sec) return Math.round(parseFloat(sec[1]));
  const minSec =
    /([\d.]+)\s*(?:minutes?|mins?)\s+([\d.]+)\s*(?:seconds?|secs?)?/i.exec(t);
  if (minSec) {
    return Math.round(parseFloat(minSec[1]) * 60 + parseFloat(minSec[2]));
  }
  const minOnly = /^([\d.]+)\s*(?:minutes?|mins?)\b/i.exec(lower);
  if (minOnly) return Math.round(parseFloat(minOnly[1]) * 60);
  return null;
}

export function normalizeNameKey(name: string): string {
  return cleanCoasterName(name).toLowerCase().replace(/\s+/g, " ").trim();
}
