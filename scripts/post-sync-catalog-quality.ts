/**
 * Run coastertrak-data quality pipeline after Supabase catalog changes.
 *
 * Local (sibling repo):
 *   npm run data:catalog-quality
 *
 * CI: set COASTERTRAK_DATA_DIR to the checked-out coastertrak-data path.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional AI_GATEWAY_API_KEY
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { applyCatalogAutoRepairs } from "../src/lib/catalog-auto-repair";
import { loadLocalEnvIfPresent } from "./lib/load-local-env";

loadLocalEnvIfPresent();

const coastertrakDataDir =
  process.env.COASTERTRAK_DATA_DIR?.trim() ||
  resolve(process.cwd(), "..", "coastertrak-data");

const skipAi = process.argv.includes("--skip-ai");
const skipFill = process.argv.includes("--skip-fill");
const aiLimit = process.env.AI_REVIEW_LIMIT?.trim() || "20";
const envFile = process.env.COASTERTRAK_ENV_FILE?.trim();
const fillLimit = process.env.CATALOG_FILL_LIMIT?.trim() || "800";
const fillImageLimit = process.env.CATALOG_FILL_IMAGE_LIMIT?.trim() || "400";

function runNodeTsx(scriptRel: string, extraArgs: string[] = []): void {
  const script = resolve(process.cwd(), scriptRel);
  const tsxArgs = ["tsx"];
  if (envFile && existsSync(envFile)) {
    tsxArgs.push(`--env-file=${envFile}`);
  }
  tsxArgs.push(script, ...extraArgs);

  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(cmd, tsxArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCli(args: string[]): void {
  const tsxArgs = ["tsx"];
  if (envFile && existsSync(envFile)) {
    tsxArgs.push(`--env-file=${envFile}`);
  }
  tsxArgs.push("src/cli/index.ts", ...args);

  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(cmd, tsxArgs, {
    cwd: coastertrakDataDir,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main(): Promise<void> {
  if (!existsSync(join(coastertrakDataDir, "package.json"))) {
    console.error(
      `coastertrak-data not found at ${coastertrakDataDir}. ` +
        "Clone it as a sibling repo or set COASTERTRAK_DATA_DIR.",
    );
    process.exit(1);
  }

  console.log(`Running catalog quality pipeline in ${coastertrakDataDir}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!skipFill) {
      console.log("Filling Wikipedia gaps (height/speed/length/mfr/image/opening year)…");
      runNodeTsx("scripts/fill-catalog-gaps.ts", [
        "--limit",
        fillLimit,
        "--image-limit",
        fillImageLimit,
        "--delay-ms",
        process.env.CATALOG_FILL_DELAY_MS?.trim() || "200",
      ]);
    } else {
      console.log("Skipping Wikipedia gap fill (--skip-fill).");
    }

    // After gap fill so stale prior-life closing years (opening > closing) are cleared.
    console.log("Applying catalog auto-repairs…");
    const repair = await applyCatalogAutoRepairs(supabase);
    console.log(
      `  parks ${repair.parksUpdated}/${repair.parksScanned} updated, ` +
        `coasters ${repair.coastersUpdated}/${repair.coastersScanned} updated, ` +
        `${repair.parkLinksUpdated} park links`,
    );
  } else {
    console.log("Skipping auto-repair / gap fill (Supabase env not set).");
  }

  runCli(["analyze:supabase"]);

  const hasAiKey = Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim(),
  );
  if (!skipAi && hasAiKey) {
    runCli(["ai:review", "--limit", aiLimit]);
  } else if (!skipAi) {
    console.log("Skipping AI review (set AI_GATEWAY_API_KEY to enable).");
  }

  runCli(["publish"]);

  console.log("Catalog quality pipeline complete.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
