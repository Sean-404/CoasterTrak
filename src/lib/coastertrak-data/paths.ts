import { join } from "node:path";
import { readdir } from "node:fs/promises";

/** ISO-ish folder name safe for filesystems (UTC). */
export function newRunId(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function wikidataRawRunDir(runId: string, dataRoot = "data"): string {
  return join(dataRoot, "raw", "wikidata", runId);
}

export function wikidataProcessedRunDir(runId: string, dataRoot = "data"): string {
  return join(dataRoot, "processed", "wikidata", runId);
}

export function wikidataReportDir(runId: string, dataRoot = "data"): string {
  return join(dataRoot, "reports", "wikidata", runId);
}

export function wikidataPublishedRunDir(runId: string, dataRoot = "data"): string {
  return join(dataRoot, "published", "wikidata", runId);
}

export function formatPageFileName(offset: number): string {
  return `${String(offset).padStart(6, "0")}.json`;
}

/** Most recent raw ingest folder name (lexicographic ≈ chronological for ISO run ids). */
export async function latestWikidataRawRunId(dataRoot = "data"): Promise<string | null> {
  return latestRunIdIn(join(dataRoot, "raw", "wikidata"));
}

export async function latestWikidataProcessedRunId(
  dataRoot = "data",
): Promise<string | null> {
  return latestRunIdIn(join(dataRoot, "processed", "wikidata"));
}

async function latestRunIdIn(root: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return null;
  }
  const runs = entries.filter(Boolean).sort();
  return runs.at(-1) ?? null;
}
