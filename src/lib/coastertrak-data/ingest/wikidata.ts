import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  WIKIDATA_SPARQL_ENDPOINT,
  fetchAllRollerCoasterRawPages,
  parseUriToQid,
  type WikidataSparqlBinding,
} from "@/lib/wikidata-coasters";

import { formatPageFileName, newRunId, wikidataRawRunDir } from "../paths";
import type { RawIngestMeta, RawIngestResult } from "../types";

export type WikidataIngestOptions = {
  dataRoot?: string;
  runId?: string;
  maxRows?: number;
  pageSize?: number;
  delayMs?: number;
  allowLiteFallback?: boolean;
  onProgress?: (message: string) => void;
};

function countUniqueItems(pages: { bindings: WikidataSparqlBinding[] }[]): number {
  const ids = new Set<string>();
  for (const page of pages) {
    for (const binding of page.bindings) {
      const item = binding.item;
      if (item?.type === "uri") ids.add(parseUriToQid(item.value));
    }
  }
  return ids.size;
}

export async function ingestWikidataRaw(
  options: WikidataIngestOptions = {},
): Promise<RawIngestResult> {
  const runId = options.runId ?? newRunId();
  const runDir = wikidataRawRunDir(runId, options.dataRoot);
  const pagesDir = join(runDir, "pages");
  await mkdir(pagesDir, { recursive: true });

  const log = options.onProgress ?? (() => {});
  log(`Fetching Wikidata raw bindings → ${runDir}`);

  const summary = await fetchAllRollerCoasterRawPages({
    maxRows: options.maxRows,
    pageSize: options.pageSize ?? 200,
    delayMs: options.delayMs ?? 2000,
    allowLiteFallback: options.allowLiteFallback ?? true,
    onPaginationRestart: async () => {
      log("  query fallback restarted pagination; clearing prior page files");
      await rm(pagesDir, { recursive: true, force: true });
      await mkdir(pagesDir, { recursive: true });
    },
    onPage: async (page) => {
      const fileName = formatPageFileName(page.offset);
      await writeFile(
        join(pagesDir, fileName),
        JSON.stringify(
          {
            offset: page.offset,
            pageSize: page.pageSize,
            queryMode: page.queryMode,
            bindingCount: page.bindings.length,
            bindings: page.bindings,
          },
          null,
          2,
        ),
        "utf8",
      );
      log(`  page offset ${page.offset} (${page.bindings.length} bindings, ${page.queryMode})`);
    },
  });

  const uniqueItemCount = countUniqueItems(summary.pages);
  const meta: RawIngestMeta = {
    generatedAt: new Date().toISOString(),
    source: "wikidata",
    runId,
    endpoint: WIKIDATA_SPARQL_ENDPOINT,
    queryMode: summary.queryMode,
    usedLiteFallback: summary.usedLiteFallback,
    pageCount: summary.pages.length,
    totalBindings: summary.totalBindings,
    uniqueItemCount,
    options: {
      maxRows: options.maxRows ?? null,
      pageSize: options.pageSize ?? 200,
      delayMs: options.delayMs ?? 2000,
      allowLiteFallback: options.allowLiteFallback ?? true,
    },
  };

  await writeFile(join(runDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  log(
    `Done: ${summary.pages.length} pages, ${summary.totalBindings} bindings, ${uniqueItemCount} unique items (${summary.queryMode}${summary.usedLiteFallback ? ", lite fallback" : ""})`,
  );

  return { runDir, meta };
}
