/**
 * Fetch roller coaster metadata from Wikidata (SPARQL) and normalize fields
 * for CoasterTrak. Uses WikiProject Roller Coasters class hierarchy (Q204832).
 */

import { cleanCoasterName } from "./display";
import { humanWikidataLabel } from "./wikidata-qid";

export { humanWikidataLabel, isWikidataQidLabel } from "./wikidata-qid";

export const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/** Compliant with https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy */
export const WIKIDATA_USER_AGENT =
  "CoasterTrak/0.1 (roller coaster catalog sync; https://github.com/)";

/**
 * WDQS label fallback. English-only returns the Q-id when an item has no `en` label
 * (common for continental European parks/rides). `mul` is the language-independent
 * official name — prefer it over regional English when `en` is missing.
 */
export const WIKIDATA_LABEL_LANGUAGES =
  "en,mul,en-gb,en-ca,nl,fr,de,ja,es,it,pt,zh";

const WIKIDATA_LABEL_SERVICE = `SERVICE wikibase:label { bd:serviceParam wikibase:language "${WIKIDATA_LABEL_LANGUAGES}". }`;

/**
 * Full SPARQL: instances of roller coaster or any subclass of Q204832.
 * Second hop on P361 uses direct P31 only (no wdt:P279* — that path timed out WDQS on full runs).
 * Q2416723 = theme park, Q3363942 = amusement park; exclude Q875912 = resort.
 */
const ROLLER_COASTER_SPARQL = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>

SELECT ?item ?itemLabel ?coord ?countryLabel ?parkLabel ?manufacturerLabel
  ?clsLabel
  ?lengthM ?speedMs ?heightM ?durationS
  ?opening ?retirement ?demolished ?rcdbId ?enwiki ?image
  ?park ?parkParent ?parkParentLabel
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
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?enwiki .
  }
  ${WIKIDATA_LABEL_SERVICE}
}
`;

/**
 * Mid-weight fallback: keeps numeric fields (length/speed/height/duration),
 * but drops the park-parent traversal that frequently triggers WDQS timeouts.
 * This preserves high-value stat completeness when full query is unstable.
 */
const ROLLER_COASTER_SPARQL_CORE = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>

SELECT ?item ?itemLabel ?coord ?countryLabel ?parkLabel ?manufacturerLabel
  ?clsLabel
  ?lengthM ?speedMs ?heightM ?durationS
  ?opening ?retirement ?demolished ?rcdbId ?enwiki ?image
  ?park
WHERE {
  ?item wdt:P31 ?cls .
  ?cls wdt:P279* wd:Q204832 .
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P361 ?park . }
  OPTIONAL { ?item wdt:P176 ?manufacturer . }
  OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?lengthM . }
  OPTIONAL { ?item p:P2052/psn:P2052/wikibase:quantityAmount ?speedMs . }
  OPTIONAL { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?heightM . }
  OPTIONAL { ?item p:P2047/psn:P2047/wikibase:quantityAmount ?durationS . }
  OPTIONAL { ?item wdt:P1619 ?opening . }
  OPTIONAL { ?item wdt:P730 ?retirement . }
  OPTIONAL { ?item wdt:P576 ?demolished . }
  OPTIONAL { ?item wdt:P2751 ?rcdbId . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?enwiki .
  }
  ${WIKIDATA_LABEL_SERVICE}
}
`;

/**
 * Lighter fallback query for WDQS outage windows.
 * Drops expensive quantity statement paths and park-parent traversal so CI can still progress.
 */
const ROLLER_COASTER_SPARQL_LITE = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>

SELECT ?item ?itemLabel ?coord ?countryLabel ?parkLabel ?manufacturerLabel
  ?clsLabel
  ?opening ?retirement ?demolished ?rcdbId ?enwiki ?image
  ?park
WHERE {
  ?item wdt:P31 ?cls .
  ?cls wdt:P279* wd:Q204832 .
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P361 ?park . }
  OPTIONAL { ?item wdt:P176 ?manufacturer . }
  OPTIONAL { ?item wdt:P1619 ?opening . }
  OPTIONAL { ?item wdt:P730 ?retirement . }
  OPTIONAL { ?item wdt:P576 ?demolished . }
  OPTIONAL { ?item wdt:P2751 ?rcdbId . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?enwiki .
  }
  ${WIKIDATA_LABEL_SERVICE}
}
`;

export type WikidataSparqlBindingValue = {
  type: "uri" | "literal" | "bnode";
  value: string;
  datatype?: string;
  "xml:lang"?: string;
};

/** One SPARQL result row as returned by Wikidata WDQS (before app normalisation). */
export type WikidataSparqlBinding = Record<string, WikidataSparqlBindingValue>;

type SparqlJsonBinding = WikidataSparqlBindingValue;

type SparqlJsonResponse = {
  results: { bindings: WikidataSparqlBinding[] };
};

export type WikidataQueryMode = "full" | "core" | "lite";

export type WikidataRawSparqlPage = {
  offset: number;
  pageSize: number;
  queryMode: WikidataQueryMode;
  bindings: WikidataSparqlBinding[];
};

export type WikidataRawFetchSummary = {
  pages: WikidataRawSparqlPage[];
  queryMode: WikidataQueryMode;
  usedLiteFallback: boolean;
  totalBindings: number;
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

function wikimediaImageUrlFromBinding(b: SparqlJsonBinding | undefined): string | null {
  if (!b) return null;
  const raw = b.value.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    if (/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i.test(raw)) {
      return raw.replace(/^http:\/\//i, "https://");
    }
    return raw.replace(/^http:\/\//i, "https://");
  }

  const fileName = raw.replace(/^File:/i, "").trim();
  if (!fileName) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
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
  const yonly = /^([+-]?\d{4})-00-00/.exec(s);
  if (yonly) return `${yonly[1].replace(/^\+/, "")}-01-01`;
  const full = /^([+-]?\d{4}-\d{2}-\d{2})/.exec(s);
  if (full) return full[1].replace(/^\+/, "");
  return null;
}

export type WikidataCoasterRow = {
  wikidataId: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  countryLabel: string | null;
  parkLabel: string | null;
  parkWikidataId: string | null;
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
  imageUrl: string | null;
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
  const endRaw = demolished || retirement || null;
  const end = endRaw ? new Date(endRaw) : null;
  const openingDate = opening ? new Date(opening) : null;
  const hasValidEnd = !!end && !Number.isNaN(end.getTime());
  const hasValidOpening = !!openingDate && !Number.isNaN(openingDate.getTime());

  /**
   * Wikidata can carry both historical retirement/demolition and a later opening date
   * for relocated/rebuilt rides. In that case, trust the later opening lifecycle.
   */
  if (
    hasValidEnd &&
    hasValidOpening &&
    openingDate.getTime() > end.getTime()
  ) {
    if (openingDate > now) return "unknown";
    return "operating";
  }

  if (hasValidEnd && end < now) return "defunct";
  if (hasValidOpening) {
    if (openingDate > now) return "unknown";
    return "operating";
  }
  if (demolished || retirement) return "defunct";
  return "unknown";
}

function bindingsToRow(
  b: Record<string, SparqlJsonBinding>,
): WikidataCoasterRow | null {
  const itemUri = bindingUri(b.item);
  if (!itemUri) return null;
  const wikidataId = parseUriToQid(itemUri);
  const label = humanWikidataLabel(bindingLiteral(b.itemLabel)) ?? wikidataId;
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
  const imageUrl = wikimediaImageUrlFromBinding(b.image);

  const speedMph = speedMs != null ? speedMs * 2.23693629 : null;
  const lengthFt = lengthM != null ? lengthM * 3.28084 : null;
  const heightFt = heightM != null ? heightM * 3.28084 : null;

  /** Immediate P361 (e.g. themed land) vs parent gate (amusement park), from Wikidata ontology — not app-specific. */
  const immediateParkLabel = humanWikidataLabel(bindingLiteral(b.parkLabel));
  const parentParkLabel = humanWikidataLabel(bindingLiteral(b.parkParentLabel));
  const resolvedParkLabel = parentParkLabel ?? immediateParkLabel;
  const parkWikidataId = (() => {
    // Prefer the amusement/theme-park parent Q-id when P361 pointed at a themed land.
    const parentUri = bindingUri(b.parkParent);
    const parkUri = bindingUri(b.park);
    const uri = parentUri ?? parkUri;
    if (!uri) return null;
    const q = parseUriToQid(uri);
    return q.startsWith("Q") ? q : null;
  })();

  return {
    wikidataId,
    label,
    latitude: geo?.lat ?? null,
    longitude: geo?.lon ?? null,
    countryLabel: bindingLiteral(b.countryLabel) ?? null,
    parkLabel: resolvedParkLabel,
    parkWikidataId,
    manufacturerLabel: humanWikidataLabel(bindingLiteral(b.manufacturerLabel)),
    lengthM,
    speedMs,
    heightM,
    durationS,
    openingDate,
    retirementDate,
    demolishedDate,
    rcdbId: bindingLiteral(b.rcdbId),
    enwikiTitle: bindingLiteral(b.enwiki),
    imageUrl,
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

/** Ensure derived imperial stats are populated from metric base fields. */
export function deriveWikidataCoasterStats(row: WikidataCoasterRow): WikidataCoasterRow {
  const speedMph =
    row.speedMph ?? (row.speedMs != null ? row.speedMs * 2.23693629 : null);
  const lengthFt =
    row.lengthFt ?? (row.lengthM != null ? row.lengthM * 3.28084 : null);
  const heightFt =
    row.heightFt ?? (row.heightM != null ? row.heightM * 3.28084 : null);
  return { ...row, speedMph, lengthFt, heightFt };
}

/** Convert immutable WDQS bindings into deduped coaster rows (no DB / known-fix layer). */
export function normalizeWikidataBindings(
  bindings: WikidataSparqlBinding[],
): WikidataCoasterRow[] {
  const rows: WikidataCoasterRow[] = [];
  for (const b of bindings) {
    const row = bindingsToRow(b);
    if (row) rows.push(row);
  }
  return mergeRowsByItem(rows).map(deriveWikidataCoasterStats);
}

/** WDQS allows a longer server-side cap via query string (ms); anonymous limit may still apply. */
const WDQS_SPARQL_URL = `${WIKIDATA_SPARQL_ENDPOINT}?format=json&timeout=300000`;
/**
 * WDQS can still 504 on complex full queries at LIMIT 200.
 * Allow the adaptive retry loop to shrink further before giving up to lite.
 */
const MIN_WDQS_PAGE_SIZE = 50;

class WikidataSparqlError extends Error {
  status: number;
  transient: boolean;

  constructor(status: number, message: string, transient: boolean) {
    super(message);
    this.name = "WikidataSparqlError";
    this.status = status;
    this.transient = transient;
  }
}

function retryAfterToMs(retryAfter: string | null): number | null {
  if (!retryAfter) return null;
  const asSeconds = Number(retryAfter);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000);
  const asDateMs = Date.parse(retryAfter);
  if (Number.isNaN(asDateMs)) return null;
  return Math.max(0, asDateMs - Date.now());
}

async function fetchWikidataSparqlQuery(
  query: string,
  retries = 3,
  contextLabel = "query",
): Promise<SparqlJsonResponse> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(WDQS_SPARQL_URL, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/sparql-query",
          "User-Agent": WIKIDATA_USER_AGENT,
        },
        body: query,
      });
    } catch (err) {
      if (attempt === retries) {
        throw new Error(
          `Wikidata SPARQL network error after ${retries + 1} attempts (${contextLabel}): ${String(err)}`,
        );
      }
      const delay = Math.min(4_000 * 2 ** attempt, 60_000);
      console.error(
        `  Wikidata network error on ${contextLabel}, retry ${attempt + 1}/${retries} in ${delay / 1000}s…`,
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (res.ok) return res.json() as Promise<SparqlJsonResponse>;

    const isTransient = res.status === 429 || res.status >= 500;
    const text = await res.text();
    if (!isTransient || attempt === retries) {
      throw new WikidataSparqlError(
        res.status,
        `Wikidata SPARQL ${res.status}: ${text.slice(0, 500)}`,
        isTransient,
      );
    }

    const is504 = res.status === 504;
    const retryAfterMs = retryAfterToMs(res.headers.get("retry-after"));
    const baseDelay =
      res.status === 429
        ? 8_000
        : is504
          ? Math.min(6_000 * 2 ** attempt, 45_000)
          : Math.min(2_500 * 2 ** attempt, 25_000);
    const delay = Math.max(baseDelay, retryAfterMs ?? 0);
    console.error(
      `  Wikidata ${res.status} on ${contextLabel}, retry ${attempt + 1}/${retries} in ${Math.round(delay / 1000)}s…`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }

  throw new Error("Unreachable");
}

async function fetchWikidataSparqlPage(
  query: string,
  offset: number,
  limit: number,
  retries = 3,
): Promise<SparqlJsonResponse> {
  const q = `${query.trim()}\nORDER BY ?item\nLIMIT ${limit}\nOFFSET ${offset}\n`;
  return fetchWikidataSparqlQuery(q, retries, `offset ${offset}`);
}

/**
 * Fill length/speed/height/duration for rows missing those fields via batched
 * VALUES queries. Used after a lite SPARQL fallback (which drops quantity paths).
 */
export async function enrichMissingQuantities(
  rows: WikidataCoasterRow[],
  options?: { batchSize?: number; delayMs?: number },
): Promise<WikidataCoasterRow[]> {
  const batchSize = options?.batchSize ?? 80;
  const delayMs = options?.delayMs ?? 1500;
  const needs = rows.filter(
    (r) =>
      r.lengthM == null ||
      r.speedMs == null ||
      r.heightM == null ||
      r.durationS == null,
  );
  if (needs.length === 0) return rows;

  const byId = new Map(rows.map((r) => [r.wikidataId, { ...r }]));
  console.error(
    `  Quantity backfill: ${needs.length}/${rows.length} rows missing stats (batch ${batchSize})…`,
  );

  for (let i = 0; i < needs.length; i += batchSize) {
    const batch = needs.slice(i, i + batchSize);
    const values = batch
      .map((r) => `wd:${r.wikidataId.trim().toUpperCase()}`)
      .filter((v) => /^wd:Q\d+$/i.test(v))
      .join(" ");
    if (!values) continue;

    const query = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX wikibase: <http://wikiba.se/ontology#>

SELECT ?item ?lengthM ?speedMs ?heightM ?durationS WHERE {
  VALUES ?item { ${values} }
  OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?lengthM . }
  OPTIONAL { ?item p:P2052/psn:P2052/wikibase:quantityAmount ?speedMs . }
  OPTIONAL { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?heightM . }
  OPTIONAL { ?item p:P2047/psn:P2047/wikibase:quantityAmount ?durationS . }
}
`.trim();

    try {
      const json = await fetchWikidataSparqlQuery(
        query,
        3,
        `quantity batch ${Math.floor(i / batchSize) + 1}`,
      );
      for (const b of json.results?.bindings ?? []) {
        const itemUri = bindingUri(b.item);
        if (!itemUri) continue;
        const qid = parseUriToQid(itemUri);
        const prev = byId.get(qid);
        if (!prev) continue;

        const lengthM = prev.lengthM ?? bindingNumber(b.lengthM);
        const speedMs = prev.speedMs ?? bindingNumber(b.speedMs);
        const heightM = prev.heightM ?? bindingNumber(b.heightM);
        const durationS = prev.durationS ?? bindingNumber(b.durationS);
        byId.set(qid, {
          ...prev,
          lengthM,
          speedMs,
          heightM,
          durationS,
          speedMph:
            prev.speedMph ??
            (speedMs != null ? speedMs * 2.23693629 : null),
          lengthFt:
            prev.lengthFt ??
            (lengthM != null ? lengthM * 3.28084 : null),
          heightFt:
            prev.heightFt ??
            (heightM != null ? heightM * 3.28084 : null),
        });
      }
    } catch (err) {
      console.error(
        `  Quantity backfill batch failed (${i}-${i + batch.length}): ${String(err)}`,
      );
    }

    if (delayMs > 0 && i + batchSize < needs.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return rows.map((r) => byId.get(r.wikidataId) ?? r);
}

type RollerCoasterPageIterateOptions = {
  pageSize?: number;
  maxRows?: number;
  delayMs?: number;
  allowLiteFallback?: boolean;
  onLiteFallback?: () => void;
  onOffset?: (offset: number) => void;
};

async function* iterateRollerCoasterSparqlPages(
  options?: RollerCoasterPageIterateOptions,
): AsyncGenerator<
  WikidataRawSparqlPage,
  { queryMode: WikidataQueryMode; usedLiteFallback: boolean }
> {
  const pageSize = options?.pageSize ?? 2000;
  const maxRows = options?.maxRows ?? Infinity;
  const delayMs = options?.delayMs ?? 2000;
  const allowLiteFallback = options?.allowLiteFallback ?? true;

  let currentPageSize = pageSize;
  let queryMode: WikidataQueryMode = "full";
  let activeQuery = ROLLER_COASTER_SPARQL;
  let hardTransientRetries = 0;
  const maxHardTransientRetries = 8;
  let offset = 0;
  let usedLiteFallback = false;
  const uniqueIds = new Set<string>();

  for (;;) {
    let json: SparqlJsonResponse;
    try {
      json = await fetchWikidataSparqlPage(
        activeQuery,
        offset,
        currentPageSize,
      );
      hardTransientRetries = 0;
    } catch (err) {
      const isTransientSparqlError =
        err instanceof WikidataSparqlError && err.transient;
      const canShrink = isTransientSparqlError && currentPageSize > MIN_WDQS_PAGE_SIZE;
      if (!isTransientSparqlError) throw err;
      if (!canShrink && queryMode !== "lite") {
        if (queryMode === "full") {
          queryMode = "core";
          activeQuery = ROLLER_COASTER_SPARQL_CORE;
          currentPageSize = Math.max(MIN_WDQS_PAGE_SIZE, Math.floor(pageSize / 2));
          hardTransientRetries = 0;
          offset = 0;
          uniqueIds.clear();
          console.error(
            "  WDQS unstable on full query at minimum page size; switching to core SPARQL query (keeps numeric stats) and restarting pagination...",
          );
          await new Promise((r) => setTimeout(r, 8_000));
          continue;
        }
        if (!allowLiteFallback) {
          throw new Error(
            "WDQS stayed unstable at minimum page size for full/core queries and --no-lite-fallback is set. Retry later for full-query completeness.",
          );
        }
        usedLiteFallback = true;
        options?.onLiteFallback?.();
        queryMode = "lite";
        activeQuery = ROLLER_COASTER_SPARQL_LITE;
        currentPageSize = MIN_WDQS_PAGE_SIZE;
        hardTransientRetries = 0;
        offset = 0;
        uniqueIds.clear();
        console.error(
          "  WDQS still unstable on core query; switching to lite SPARQL query and restarting pagination...",
        );
        await new Promise((r) => setTimeout(r, 8_000));
        continue;
      }
      if (!canShrink) {
        if (hardTransientRetries >= maxHardTransientRetries) throw err;
        hardTransientRetries += 1;
        const cooldown = Math.min(15_000 * hardTransientRetries, 120_000);
        console.error(
          `  WDQS still transient at offset ${offset}; cooldown retry ${hardTransientRetries}/${maxHardTransientRetries} in ${Math.round(cooldown / 1000)}s...`,
        );
        await new Promise((r) => setTimeout(r, cooldown));
        continue;
      }

      const nextPageSize = Math.max(
        MIN_WDQS_PAGE_SIZE,
        Math.floor(currentPageSize / 2),
      );
      console.error(
        `  WDQS transient failure at offset ${offset}; reducing page size ${currentPageSize} -> ${nextPageSize} and retrying...`,
      );
      currentPageSize = nextPageSize;
      await new Promise((r) => setTimeout(r, 4_000));
      continue;
    }

    const bindings = json.results?.bindings ?? [];
    if (bindings.length === 0) break;

    options?.onOffset?.(offset);
    yield {
      offset,
      pageSize: currentPageSize,
      queryMode,
      bindings,
    };

    for (const b of bindings) {
      const itemUri = bindingUri(b.item);
      if (itemUri) uniqueIds.add(parseUriToQid(itemUri));
    }

    if (uniqueIds.size >= maxRows) break;
    if (bindings.length < currentPageSize) break;
    offset += currentPageSize;
    if (currentPageSize < pageSize && queryMode !== "lite") {
      currentPageSize = Math.min(pageSize, currentPageSize * 2);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return { queryMode, usedLiteFallback };
}

/** Fetch immutable WDQS bindings (one file per page in the data pipeline). */
export async function fetchAllRollerCoasterRawPages(options?: {
  pageSize?: number;
  maxRows?: number;
  delayMs?: number;
  allowLiteFallback?: boolean;
  onLiteFallback?: () => void;
  onPage?: (page: WikidataRawSparqlPage) => void | Promise<void>;
  /** Called when pagination restarts after a full→core or core→lite query fallback. */
  onPaginationRestart?: () => void | Promise<void>;
}): Promise<WikidataRawFetchSummary> {
  const pages: WikidataRawSparqlPage[] = [];
  const gen = iterateRollerCoasterSparqlPages(options);
  let step = await gen.next();
  while (!step.done) {
    const page = step.value;
    // Fallback modes restart at offset 0; drop pages from the failed query mode.
    if (pages.length > 0 && page.offset === 0) {
      pages.length = 0;
      await options?.onPaginationRestart?.();
    }
    pages.push(page);
    if (options?.onPage) await options.onPage(page);
    step = await gen.next();
  }

  const { queryMode, usedLiteFallback } = step.value;
  const totalBindings = pages.reduce((n, p) => n + p.bindings.length, 0);
  return { pages, queryMode, usedLiteFallback, totalBindings };
}

export async function fetchAllRollerCoasters(options?: {
  pageSize?: number;
  maxRows?: number;
  onPage?: (page: WikidataCoasterRow[], offset: number) => void | Promise<void>;
  delayMs?: number;
  allowLiteFallback?: boolean;
  onLiteFallback?: () => void;
  /** When true (default), backfill length/speed/height/duration after a lite fallback. */
  enrichQuantitiesAfterLite?: boolean;
}): Promise<WikidataCoasterRow[]> {
  const maxRows = options?.maxRows ?? Infinity;
  const enrichQuantitiesAfterLite = options?.enrichQuantitiesAfterLite ?? true;

  const out: WikidataCoasterRow[] = [];
  const gen = iterateRollerCoasterSparqlPages(options);
  let step = await gen.next();
  while (!step.done) {
    const { bindings, offset } = step.value;
    const pageRows: WikidataCoasterRow[] = [];
    for (const b of bindings) {
      const row = bindingsToRow(b);
      if (row) pageRows.push(row);
    }
    const merged = mergeRowsByItem(pageRows);
    out.push(...merged);
    if (options?.onPage) await options.onPage(merged, offset);
    step = await gen.next();
  }

  const { usedLiteFallback } = step.value;

  let unique = mergeRowsByItem(out);
  if (maxRows < Infinity && unique.length > maxRows) {
    unique = unique.slice(0, maxRows);
  }

  if (usedLiteFallback && enrichQuantitiesAfterLite) {
    console.error(
      "  Lite SPARQL fallback was used (stats may be sparse); running quantity backfill…",
    );
    unique = await enrichMissingQuantities(unique);
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
  return cleanCoasterName(name)
    .toLowerCase()
    // Normalize Unicode dashes/minus to ASCII hyphen so CSV/Wikidata/DB keys match.
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[''`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
