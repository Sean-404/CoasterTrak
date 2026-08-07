/**
 * Validate Wikidata coaster JSON before upload/sync.
 *
 * Fails on:
 * - Duplicate wikidataId rows
 * - Suspicious incident/disaster article titles being used as ride titles (with --strict-incidents)
 * - Fetch metadata marking usedLiteFallback (unless --allow-lite-meta)
 *
 * Usage:
 *   npx tsx scripts/validate-wikidata-coasters.ts
 *   npx tsx scripts/validate-wikidata-coasters.ts --in data/wikidata_coasters.json
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { arg, hasFlag, runMain } from "./lib/cli";
import type { WikidataCoasterRow } from "../src/lib/wikidata-coasters";

const INCIDENT_TITLE_RE =
  /\b(disaster|accident|incident|derailment|collision|crash|fire|explosion|fatal)\b/i;
// Known edge case: this ride's enwiki page points to an incident article title.
const INCIDENT_TITLE_QID_ALLOWLIST = new Set(["Q22000267"]);

type DuplicateIssue = {
  wikidataId: string;
  count: number;
  labels: string[];
  enwikiTitles: string[];
};

type IncidentIssue = {
  wikidataId: string;
  label: string;
  enwikiTitle: string;
};

type FetchMeta = {
  generatedAt?: string;
  rowCount?: number;
  usedLiteFallback?: boolean | null;
  allowLiteFallback?: boolean;
};

async function main() {
  const inPath = resolve(arg("--in") ?? "data/wikidata_coasters.json");
  const metaPath = /\.json$/i.test(inPath)
    ? inPath.replace(/\.json$/i, ".meta.json")
    : `${inPath}.meta.json`;
  const strictIncidents = hasFlag("--strict-incidents");
  const allowLiteMeta = hasFlag("--allow-lite-meta");
  const rows = JSON.parse(await readFile(inPath, "utf8")) as WikidataCoasterRow[];

  let fetchMeta: FetchMeta | null = null;
  try {
    fetchMeta = JSON.parse(await readFile(metaPath, "utf8")) as FetchMeta;
  } catch {
    fetchMeta = null;
  }

  const byQid = new Map<string, WikidataCoasterRow[]>();
  const incidentIssues: IncidentIssue[] = [];

  for (const row of rows) {
    const qid = row.wikidataId.trim().toUpperCase();
    const arr = byQid.get(qid) ?? [];
    arr.push(row);
    byQid.set(qid, arr);

    const title = (row.enwikiTitle ?? "").trim();
    if (!title) continue;
    if (!INCIDENT_TITLE_RE.test(title)) continue;
    if (INCIDENT_TITLE_QID_ALLOWLIST.has(qid)) continue;
    // If label itself is incident-like, this might be intentional.
    if (INCIDENT_TITLE_RE.test(row.label)) continue;
    incidentIssues.push({
      wikidataId: qid,
      label: row.label,
      enwikiTitle: title,
    });
  }

  const duplicateIssues: DuplicateIssue[] = [];
  for (const [qid, items] of byQid) {
    if (items.length <= 1) continue;
    duplicateIssues.push({
      wikidataId: qid,
      count: items.length,
      labels: [...new Set(items.map((r) => r.label))],
      enwikiTitles: [...new Set(items.map((r) => r.enwikiTitle ?? "").filter(Boolean))],
    });
  }

  const usedLiteFallback = fetchMeta?.usedLiteFallback === true;
  const liteMetaBlocked = usedLiteFallback && !allowLiteMeta;

  const missingStats = rows.filter(
    (r) =>
      r.lengthM == null &&
      r.speedMs == null &&
      r.heightM == null &&
      r.durationS == null,
  ).length;

  const hasErrors =
    duplicateIssues.length > 0 ||
    (strictIncidents && incidentIssues.length > 0) ||
    liteMetaBlocked;

  const summary = {
    file: inPath,
    metaFile: fetchMeta ? metaPath : null,
    totalRows: rows.length,
    duplicateQids: duplicateIssues.length,
    suspiciousIncidentTitles: incidentIssues.length,
    usedLiteFallback: fetchMeta?.usedLiteFallback ?? null,
    rowsMissingAllQuantities: missingStats,
  };

  console.error(JSON.stringify(summary, null, 2));

  if (duplicateIssues.length > 0) {
    console.error("\nDuplicate Wikidata IDs (sample):");
    console.error(JSON.stringify(duplicateIssues.slice(0, 20), null, 2));
  }

  if (incidentIssues.length > 0) {
    console.error("\nSuspicious incident/disaster enwiki titles (sample):");
    console.error(JSON.stringify(incidentIssues.slice(0, 20), null, 2));
    if (!strictIncidents) {
      console.error(
        "\nWarning: suspicious incident titles detected, continuing (non-blocking by default).",
      );
      console.error("Pass --strict-incidents to fail validation on these findings.");
    }
  }

  if (usedLiteFallback) {
    console.error(
      "\nLite SPARQL fallback was used for this snapshot (stats may be incomplete).",
    );
    if (liteMetaBlocked) {
      console.error(
        "Failing validation so a thin catalog is not uploaded. Re-run fetch when WDQS is healthy,",
      );
      console.error("or pass --allow-lite-meta to override (not recommended for production).");
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.error("\nValidation passed.");
}

runMain(main);
