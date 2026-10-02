/**
 * Download the published catalog-quality report from Supabase Storage.
 *
 *   npx tsx --env-file=.env.local scripts/fetch-catalog-quality-report.ts
 *   npx tsx --env-file=.env.local scripts/fetch-catalog-quality-report.ts --out tmp-report.json
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  CATALOG_QUALITY_BUCKET,
  CATALOG_QUALITY_PREFIX,
  type CatalogQualityReport,
} from "../src/lib/catalog-quality-storage";
import { loadLocalEnvIfPresent } from "./lib/load-local-env";

loadLocalEnvIfPresent();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const outIdx = process.argv.indexOf("--out");
  const outPath = resolve(
    outArg?.slice("--out=".length) ||
      (outIdx >= 0 ? process.argv[outIdx + 1] : "tmp-catalog-quality-report.json") ||
      "tmp-catalog-quality-report.json",
  );

  const supabase = createClient(url, key);
  const path = `${CATALOG_QUALITY_PREFIX}/report.json`;
  const { data, error } = await supabase.storage.from(CATALOG_QUALITY_BUCKET).download(path);
  if (error) throw error;

  const text = await data.text();
  writeFileSync(outPath, text, "utf8");

  const report = JSON.parse(text) as CatalogQualityReport;
  const byCode: Record<string, number> = {};
  for (const f of report.findings) {
    const key = `${f.severity}:${f.code}`;
    byCode[key] = (byCode[key] ?? 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        summary: report.summary,
        findingCounts: byCode,
        wrote: outPath,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
