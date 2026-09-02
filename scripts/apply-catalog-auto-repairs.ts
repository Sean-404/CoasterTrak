/**
 * Apply deterministic catalog repairs to Supabase (known fixes, coords, park links).
 *
 *   npx tsx --env-file=.env.local scripts/apply-catalog-auto-repairs.ts
 *   npx tsx --env-file=.env.local scripts/apply-catalog-auto-repairs.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";

import { applyCatalogAutoRepairs } from "@/lib/catalog-auto-repair";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const dryRun = process.argv.includes("--dry-run");
  const supabase = createClient(url, key);
  const result = await applyCatalogAutoRepairs(supabase, { dryRun });

  console.log(
    dryRun ? "Dry run — no writes" : "Applied catalog auto-repairs",
    JSON.stringify(
      {
        parksScanned: result.parksScanned,
        parksUpdated: result.parksUpdated,
        parksEnsured: result.parksEnsured,
        coastersScanned: result.coastersScanned,
        coastersUpdated: result.coastersUpdated,
        parkLinksUpdated: result.parkLinksUpdated,
      },
      null,
      2,
    ),
  );

  if (result.details.length) {
    console.log("\nChanges:");
    for (const line of result.details.slice(0, 50)) console.log(`  ${line}`);
    if (result.details.length > 50) {
      console.log(`  … and ${result.details.length - 50} more`);
    }
  } else {
    console.log("\nNo changes needed.");
  }
}

void main();
