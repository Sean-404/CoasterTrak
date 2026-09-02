/**
 * @deprecated Use `npm run data:auto-repair` — applies the same repairs automatically.
 */
import { createClient } from "@supabase/supabase-js";

import { applyCatalogAutoRepairs } from "@/lib/catalog-auto-repair";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const dryRun = process.argv.includes("--dry-run");
  const result = await applyCatalogAutoRepairs(createClient(url, key), { dryRun });
  console.log(JSON.stringify(result, null, 2));
}

void main();
