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
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.WIKIDATA_STORAGE_BUCKET?.trim() || "catalog";
const objectPath = process.env.WIKIDATA_STORAGE_OBJECT?.trim() || "wikidata_coasters.json";

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Create a .env.local file or set them in your environment.",
  );
  process.exit(1);
}

async function main() {
  const filePath = resolve(arg("--file") ?? "data/wikidata_coasters.json");
  console.error(`Reading ${filePath}...`);
  const buf = await readFile(filePath);
  const sizeMb = (buf.length / (1024 * 1024)).toFixed(2);
  console.error(`  ${sizeMb} MiB`);

  const supabase = createClient(supabaseUrl!, serviceKey!);

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
