/**
 * Validate Wikidata coaster JSON before upload/sync.
 *
 * Fails on:
 * - Duplicate wikidataId rows
 * - Suspicious incident/disaster article titles being used as ride titles
 *
 * Usage:
 *   npx tsx scripts/validate-wikidata-coasters.ts
 *   npx tsx scripts/validate-wikidata-coasters.ts --in data/wikidata_coasters.json
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { arg, runMain } from "./lib/cli";
import type { WikidataCoasterRow } from "../src/lib/wikidata-coasters";

const INCIDENT_TITLE_RE =
  /\b(disaster|accident|incident|derailment|collision|crash|fire|explosion|fatal)\b/i;

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

async function main() {
  const inPath = resolve(arg("--in") ?? "data/wikidata_coasters.json");
  const rows = JSON.parse(await readFile(inPath, "utf8")) as WikidataCoasterRow[];

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

  const hasErrors = duplicateIssues.length > 0 || incidentIssues.length > 0;

  const summary = {
    file: inPath,
    totalRows: rows.length,
    duplicateQids: duplicateIssues.length,
    suspiciousIncidentTitles: incidentIssues.length,
  };

  console.error(JSON.stringify(summary, null, 2));

  if (duplicateIssues.length > 0) {
    console.error("\nDuplicate Wikidata IDs (sample):");
    console.error(JSON.stringify(duplicateIssues.slice(0, 20), null, 2));
  }

  if (incidentIssues.length > 0) {
    console.error("\nSuspicious incident/disaster enwiki titles (sample):");
    console.error(JSON.stringify(incidentIssues.slice(0, 20), null, 2));
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.error("\nValidation passed.");
}

runMain(main);

