/**
 * Upload data/wikidata_coasters.json to Supabase Storage (public catalog bucket).
 * Use the printed URL as WIKIDATA_COASTERS_URL in Vercel / local .env for catalog sync.
 *
 * Prerequisites:
 *   1. Apply supabase/migrations/003_catalog_storage_bucket.sql in the Supabase SQL editor.
 *   2. NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/upload-wikidata-to-storage.ts [--file data/wikidata_coasters.json]
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { arg, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";

const bucket = process.env.WIKIDATA_STORAGE_BUCKET?.trim() || "catalog";
const objectPath = process.env.WIKIDATA_STORAGE_OBJECT?.trim() || "wikidata_coasters.json";

async function main() {
  const filePath = resolve(arg("--file") ?? "data/wikidata_coasters.json");
  console.error(`Reading ${filePath}...`);
  const buf = await readFile(filePath);
  const sizeMb = (buf.length / (1024 * 1024)).toFixed(2);
  console.error(`  ${sizeMb} MiB`);

  const supabase = createServiceRoleClient();

  const { error: upErr } = await supabase.storage.from(bucket).upload(objectPath, buf, {
    contentType: "application/json",
    upsert: true,
  });

  if (upErr) {
    console.error("Upload failed:", upErr.message);
    if (upErr.message.includes("Bucket not found") || upErr.message.includes("not found")) {
      console.error(
        "\nCreate the bucket by running supabase/migrations/003_catalog_storage_bucket.sql in the Supabase SQL editor.",
      );
    }
    process.exit(1);
  }

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  const publicUrl = pub.publicUrl;

  console.error(`Uploaded to bucket "${bucket}" as "${objectPath}".`);
  console.log(publicUrl);
}

runMain(main);
