/**
 * Write this site's hidden-row rules to coastertrak-data so its quality report skips the
 * rows the public catalog already hides (see src/lib/catalog-hidden-rules.ts).
 *
 *   npx tsx scripts/export-catalog-hidden-rules.ts          # write the shared copy
 *   npx tsx scripts/export-catalog-hidden-rules.ts --check  # exit 1 when it is out of date
 *
 * Target: $COASTERTRAK_DATA_DIR or ../coastertrak-data, file src/rules/catalog-hidden-rules.json.
 * Run by post-sync-catalog-quality.ts before analyze, so CI always uses the current rules.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  buildCatalogHiddenRules,
  CATALOG_HIDDEN_RULES_DATA_PATH,
  serializeCatalogHiddenRules,
} from "../src/lib/catalog-hidden-rules";

function exportCatalogHiddenRules(options: {
  dataDir: string;
  check?: boolean;
}): { path: string; changed: boolean } {
  const path = join(options.dataDir, CATALOG_HIDDEN_RULES_DATA_PATH);
  const next = serializeCatalogHiddenRules(buildCatalogHiddenRules());
  const current = existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : null;
  const changed = current !== next;
  if (changed && !options.check) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next, "utf8");
  }
  return { path, changed };
}

function main(): void {
  const dataDir =
    process.env.COASTERTRAK_DATA_DIR?.trim() || resolve(process.cwd(), "..", "coastertrak-data");
  if (!existsSync(join(dataDir, "package.json"))) {
    console.error(
      `coastertrak-data not found at ${dataDir}. Clone it as a sibling repo or set COASTERTRAK_DATA_DIR.`,
    );
    process.exit(1);
  }

  const check = process.argv.includes("--check");
  const { path, changed } = exportCatalogHiddenRules({ dataDir, check });
  if (check) {
    if (changed) {
      console.error(`${path} is out of date. Run: npx tsx scripts/export-catalog-hidden-rules.ts`);
      process.exit(1);
    }
    console.log(`${path} is up to date.`);
    return;
  }
  console.log(changed ? `Wrote ${path}` : `${path} already up to date.`);
}

main();
