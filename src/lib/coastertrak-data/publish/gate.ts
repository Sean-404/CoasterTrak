import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

import { analyzeDedupeAndConflicts } from "../analyze/dedupe-conflicts";
import { wikidataPublishedRunDir } from "../paths";
import type { PublishGateResult } from "../types";
import { validateWikidataSnapshot } from "../validate/wikidata";
import {
  buildWikidataFieldOverrideMap,
  enrichWikidataSnapshot,
  type WikidataFieldOverrideRow,
} from "./enrich-snapshot";

type SnapshotMeta = {
  sourceRunId?: string;
  usedLiteFallback?: boolean | null;
  sourceUsedLiteFallback?: boolean;
  sourceQueryMode?: string;
};

export type GateAndPublishOptions = {
  sourcePath: string;
  metaPath?: string | null;
  reportRunId?: string;
  dataRoot?: string;
  minRows?: number;
  failOnDuplicates?: boolean;
  allowLiteMeta?: boolean;
  /** When true, upload to Supabase storage + DB after gates pass. Default false. */
  apply?: boolean;
  onProgress?: (message: string) => void;
};

async function loadFieldOverridesByWikidataId(): Promise<
  Map<string, Map<string, import("@/lib/data-platform/field-overrides").FieldOverrideRow>>
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Map();

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("data_coaster_field_overrides")
    .select("field_name, value_int, value_text, source, source_url, approved, coasters!inner(wikidata_id)")
    .eq("approved", true);

  if (error || !data) return new Map();

  const rows: WikidataFieldOverrideRow[] = [];
  for (const row of data as Array<Record<string, unknown>>) {
    const coasters = row.coasters as { wikidata_id?: string | null } | null;
    const wikidataId = coasters?.wikidata_id?.trim();
    if (!wikidataId) continue;
    rows.push({
      coaster_id: 0,
      field_name: String(row.field_name),
      value_int: row.value_int as number | null,
      value_text: row.value_text as string | null,
      source: row.source as string | null,
      source_url: row.source_url as string | null,
      approved: row.approved as boolean | undefined,
      wikidata_id: wikidataId,
    });
  }

  return buildWikidataFieldOverrideMap(rows);
}

export async function gateAndPublishCatalog(
  options: GateAndPublishOptions,
): Promise<PublishGateResult> {
  const log = options.onProgress ?? (() => {});
  const sourcePath = resolve(options.sourcePath);
  const metaPath =
    options.metaPath ??
    (sourcePath.endsWith(".json")
      ? sourcePath.replace(/\.json$/i, ".meta.json")
      : `${sourcePath}.meta.json`);

  log(`Gated publish: loading ${sourcePath}…`);
  const rows = JSON.parse(await readFile(sourcePath, "utf8")) as WikidataCoasterRow[];

  let meta: SnapshotMeta | null = null;
  try {
    meta = JSON.parse(await readFile(metaPath, "utf8")) as SnapshotMeta;
  } catch {
    meta = null;
  }

  const runId =
    options.reportRunId ??
    meta?.sourceRunId ??
    new Date().toISOString().replace(/[:.]/g, "-");

  log("  running validation gate…");
  const { report: validateReport, passed: validatePassed } = validateWikidataSnapshot({
    rows,
    sourcePath,
    meta,
    metaPath,
    minRows: options.minRows,
    allowLiteMeta: options.allowLiteMeta,
  });

  log("  running dedupe gate…");
  const dedupe = analyzeDedupeAndConflicts(rows);
  const dedupePassed =
    dedupe.summary.errors === 0 &&
    !(options.failOnDuplicates && dedupe.summary.duplicateGroups > 0);

  const passed = validatePassed && dedupePassed;
  if (!passed) {
    log("  gate failed — snapshot will not be published");
    const failedDir = wikidataPublishedRunDir(runId, options.dataRoot);
    await mkdir(failedDir, { recursive: true });
    const gateReportPath = join(failedDir, "gate-report.json");
    const summary = {
      validatePassed,
      dedupeErrors: dedupe.summary.errors,
      duplicateGroups: dedupe.summary.duplicateGroups,
      knownFixesApplied: 0,
      fieldOverridesApplied: 0,
      rowCount: rows.length,
    };
    await writeFile(
      gateReportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          passed: false,
          applied: false,
          sourcePath,
          metaPath,
          validateSummary: validateReport.summary,
          dedupeSummary: dedupe.summary,
          summary,
        },
        null,
        2,
      ),
      "utf8",
    );
    return {
      passed: false,
      applied: false,
      runId,
      sourcePath,
      publishedPath: join(failedDir, "coasters.json"),
      metaPath: join(failedDir, "meta.json"),
      gateReportPath,
      summary,
    };
  }

  log("  applying known fixes + DB field overrides…");
  const overrides = await loadFieldOverridesByWikidataId();
  const { rows: enriched, knownFixesApplied, fieldOverridesApplied } =
    enrichWikidataSnapshot(rows, overrides);

  const publishedDir = wikidataPublishedRunDir(runId, options.dataRoot);
  await mkdir(publishedDir, { recursive: true });
  const publishedPath = join(publishedDir, "coasters.json");
  const publishedMetaPath = join(publishedDir, "meta.json");
  const gateReportPath = join(publishedDir, "gate-report.json");

  const summary = {
    validatePassed: true,
    dedupeErrors: 0,
    duplicateGroups: dedupe.summary.duplicateGroups,
    knownFixesApplied,
    fieldOverridesApplied,
    rowCount: enriched.length,
  };

  await writeFile(publishedPath, JSON.stringify(enriched, null, 2), "utf8");
  await writeFile(
    publishedMetaPath,
    JSON.stringify(
      {
        ...(meta ?? {}),
        generatedAt: new Date().toISOString(),
        source: "coastertrak-data",
        pipeline: "gated-publish",
        sourceRunId: runId,
        sourcePath,
        publishedPath,
        rowCount: enriched.length,
        gateSummary: summary,
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    gateReportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: true,
        applied: Boolean(options.apply),
        sourcePath,
        metaPath,
        publishedPath,
        validateSummary: validateReport.summary,
        dedupeSummary: dedupe.summary,
        summary,
      },
      null,
      2,
    ),
    "utf8",
  );

  log(`  published snapshot → ${publishedPath}`);

  let applied = false;
  if (options.apply) {
    log("  applying to Supabase storage + DB…");
    execSync(
      `npx tsx scripts/upload-wikidata-to-storage.ts --file ${JSON.stringify(publishedPath)}`,
      { stdio: "inherit", env: process.env },
    );
    execSync(
      `npx tsx scripts/upload-wikidata-to-db.ts --wikidata ${JSON.stringify(publishedPath)}`,
      { stdio: "inherit", env: process.env },
    );
    applied = true;
    log("  Supabase upload complete");
  } else {
    log("  dry-run: pass --apply to upload to Supabase");
  }

  return {
    passed: true,
    applied,
    runId,
    sourcePath,
    publishedPath,
    metaPath: publishedMetaPath,
    gateReportPath,
    summary,
  };
}
