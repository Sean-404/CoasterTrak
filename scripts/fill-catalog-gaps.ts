/**
 * Fill missing coaster catalog fields from Wikipedia when a source article exists.
 *
 * 1) Infobox stats (height/speed/length/duration/inversions/manufacturer/type/opening year)
 * 2) Page images for null image_url
 *
 * Usage:
 *   npm run data:fill-gaps
 *   npm run data:fill-gaps -- --dry-run --limit 50
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { loadLocalEnvIfPresent } from "./lib/load-local-env";

loadLocalEnvIfPresent();

const skipImages = process.argv.includes("--skip-images");
const dryRun = process.argv.includes("--dry-run");

function argValue(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function runTsx(scriptRel: string, extraArgs: string[]): void {
  const script = resolve(process.cwd(), scriptRel);
  const tsxArgs = ["tsx", script, ...extraArgs];
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  console.log(`\n→ ${scriptRel} ${extraArgs.join(" ")}`.trimEnd());
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

function main(): void {
  const limit = argValue("--limit", "800");
  const imageLimit = argValue("--image-limit", "400");
  const delayMs = argValue("--delay-ms", "200");

  const common: string[] = ["--limit", limit, "--delay-ms", delayMs];
  if (dryRun) common.push("--dry-run");

  console.log("Filling catalog gaps from Wikipedia (null-fill only)…");
  runTsx("scripts/wikipedia-infobox-backfill.ts", common);

  if (!skipImages) {
    const imageArgs = ["--limit", imageLimit, "--delay-ms", delayMs];
    if (dryRun) imageArgs.push("--dry-run");
    runTsx("scripts/backfill-wikipedia-images.ts", imageArgs);
  } else {
    console.log("Skipping image backfill (--skip-images).");
  }

  console.log("\nGap fill complete. Re-run analyze/publish to refresh the admin missing-data queue.");
}

main();
