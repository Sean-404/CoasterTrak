/**
 * Inspect Wikidata coaster rows linked to a specific park entity.
 *
 * Usage:
 *   npx tsx scripts/inspect-wikidata-park.ts --park-qid Q131531215
 *   npx tsx scripts/inspect-wikidata-park.ts --park-qid Q131531215 --json
 */

import {
  WIKIDATA_SPARQL_ENDPOINT,
  WIKIDATA_USER_AGENT,
  parseUriToQid,
  parseWikidataTime,
  parseWktPoint,
} from "../src/lib/wikidata-coasters";
import { arg, hasFlag, runMain } from "./lib/cli";

type Binding = { type: "uri" | "literal" | "bnode"; value: string };
type SparqlResponse = { results?: { bindings?: Record<string, Binding>[] } };

function lit(b: Binding | undefined): string | null {
  if (!b || b.type !== "literal") return null;
  return b.value;
}

function uri(b: Binding | undefined): string | null {
  if (!b || b.type !== "uri") return null;
  return b.value;
}

function num(b: Binding | undefined): number | null {
  const v = lit(b);
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parkQuery(parkQid: string): string {
  return `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX wikibase: <http://wikiba.se/ontology#>

SELECT ?item ?itemLabel ?park ?parkLabel ?countryLabel ?clsLabel
  ?opening ?retirement ?demolished ?rcdbId
  ?lengthM ?speedMs ?heightM ?durationS ?coord
WHERE {
  VALUES ?targetPark { wd:${parkQid} }
  ?item wdt:P31 ?cls .
  ?cls wdt:P279* wd:Q204832 .
  ?item wdt:P361/wdt:P361* ?targetPark .

  OPTIONAL { ?item wdt:P361 ?park . }
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P31 ?itemClass . }
  OPTIONAL { ?item wdt:P1619 ?opening . }
  OPTIONAL { ?item wdt:P730 ?retirement . }
  OPTIONAL { ?item wdt:P576 ?demolished . }
  OPTIONAL { ?item wdt:P2751 ?rcdbId . }
  OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?lengthM . }
  OPTIONAL { ?item p:P2052/psn:P2052/wikibase:quantityAmount ?speedMs . }
  OPTIONAL { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?heightM . }
  OPTIONAL { ?item p:P2047/psn:P2047/wikibase:quantityAmount ?durationS . }
  OPTIONAL { ?item wdt:P625 ?coord . }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?itemLabel
`;
}

function inferStatus(
  openingDate: string | null,
  retirementDate: string | null,
  demolishedDate: string | null,
): "operating" | "defunct" | "unknown" {
  const now = new Date();
  const endRaw = demolishedDate || retirementDate || null;
  const end = endRaw ? new Date(endRaw) : null;
  const opening = openingDate ? new Date(openingDate) : null;
  const hasEnd = !!end && !Number.isNaN(end.getTime());
  const hasOpening = !!opening && !Number.isNaN(opening.getTime());

  if (hasEnd && hasOpening && opening.getTime() > end.getTime()) {
    return opening > now ? "unknown" : "operating";
  }
  if (hasEnd && end < now) return "defunct";
  if (hasOpening) return opening > now ? "unknown" : "operating";
  if (demolishedDate || retirementDate) return "defunct";
  return "unknown";
}

async function main() {
  const rawQid = (arg("--park-qid") ?? "").trim().toUpperCase();
  if (!/^Q\d+$/.test(rawQid)) {
    throw new Error("Provide --park-qid Q#### (example: --park-qid Q131531215)");
  }

  const res = await fetch(`${WIKIDATA_SPARQL_ENDPOINT}?format=json`, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/sparql-query",
      "User-Agent": WIKIDATA_USER_AGENT,
    },
    body: parkQuery(rawQid),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wikidata SPARQL ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as SparqlResponse;
  const rows = (json.results?.bindings ?? []).map((b) => {
    const itemUri = uri(b.item);
    const qid = itemUri ? parseUriToQid(itemUri) : null;
    const openingDate = parseWikidataTime(lit(b.opening) ?? undefined);
    const retirementDate = parseWikidataTime(lit(b.retirement) ?? undefined);
    const demolishedDate = parseWikidataTime(lit(b.demolished) ?? undefined);
    const speedMs = num(b.speedMs);
    const lengthM = num(b.lengthM);
    const heightM = num(b.heightM);
    const durationS = num(b.durationS);
    const geo = parseWktPoint(lit(b.coord) ?? undefined);
    return {
      wikidataId: qid,
      label: lit(b.itemLabel),
      parkLabel: lit(b.parkLabel),
      parkQid: uri(b.park) ? parseUriToQid(uri(b.park) as string) : null,
      countryLabel: lit(b.countryLabel),
      coasterTypeLabel: lit(b.clsLabel),
      rcdbId: lit(b.rcdbId),
      openingDate,
      retirementDate,
      demolishedDate,
      status: inferStatus(openingDate, retirementDate, demolishedDate),
      speedMph: speedMs != null ? speedMs * 2.23693629 : null,
      lengthFt: lengthM != null ? lengthM * 3.28084 : null,
      heightFt: heightM != null ? heightM * 3.28084 : null,
      durationS,
      latitude: geo?.lat ?? null,
      longitude: geo?.lon ?? null,
    };
  });

  if (hasFlag("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`Park ${rawQid}: ${rows.length} coaster row(s) from Wikidata`);
  for (const r of rows) {
    console.log(
      `- ${r.label ?? "(no label)"} (${r.wikidataId ?? "?"}) | park=${r.parkLabel ?? "null"} | status=${r.status} | speed=${r.speedMph?.toFixed(1) ?? "null"} mph | height=${r.heightFt?.toFixed(1) ?? "null"} ft | inv=${r.coasterTypeLabel ?? "null"}`,
    );
  }
}

runMain(main);
