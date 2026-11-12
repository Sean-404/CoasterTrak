/**
 * The rules this site uses to hide coaster rows from the public catalog, as plain data.
 *
 * coastertrak-data reads the same rules from `src/rules/catalog-hidden-rules.json` so its
 * quality report does not keep flagging rows the site already hides. Regenerate that file
 * whenever one of the source tables changes:
 *
 *   npx tsx scripts/export-catalog-hidden-rules.ts          # write ../coastertrak-data copy
 *   npx tsx scripts/export-catalog-hidden-rules.ts --check  # fail if it is out of date
 *
 * Sources: SKIP_WIKIDATA_COASTER_IDS (coaster-known-fixes.ts), MISATTRIBUTED_ROWS and
 * NON_COASTER_ROWS (catalog-closures.ts), isCatalogHiddenParkName (park-match.ts).
 */
import { MISATTRIBUTED_ROWS, NON_COASTER_ROWS } from "@/lib/catalog-closures";
import { skippedWikidataCoasterIds } from "@/lib/coaster-known-fixes";
import { isCatalogHiddenParkName, PLACEHOLDER_PARK_NAMES } from "@/lib/park-match";

export const CATALOG_HIDDEN_RULES_VERSION = 1;

/** Path of the shared copy inside the coastertrak-data repo. */
export const CATALOG_HIDDEN_RULES_DATA_PATH = "src/rules/catalog-hidden-rules.json";

export type CatalogHiddenRules = {
  version: number;
  /** Wikidata ids never listed (cancelled concepts, merged second items). */
  skipWikidataCoasterIds: string[];
  /** Park name → coaster names attached to a park the ride never ran at. */
  misattributedRows: Record<string, string[]>;
  /** Park name → attraction names that are not roller coasters. */
  nonCoasterRows: Record<string, string[]>;
  /** Catch-all park names, lowercased. Other placeholder checks are code; see the examples. */
  placeholderParkNames: string[];
  /**
   * Park names with what isCatalogHiddenParkName returns for each. coastertrak-data mirrors the
   * regex parts of that check in code and tests its mirror against these.
   */
  hiddenParkNameExamples: { name: string; hidden: boolean }[];
};

/** Names chosen to exercise every branch of isCatalogHiddenParkName. */
const PARK_NAME_EXAMPLES = [
  "",
  "   ",
  "Other",
  " other ",
  "OTHER",
  "Unknown",
  "N/A",
  "na",
  "Misc",
  "Unknown / historical park (Japan)",
  "unknown/historical park",
  "Q3569870",
  "q42",
  "Orlando, FloridaKissimmee, FloridaFayetteville, GeorgiaUnited States",
  "Sandusky, OhioUnited States",
  "SeaWorld Orlando, Florida",
  "SeaWorld Orlando",
  "Universal Studios Florida",
  "Six Flags America",
  "Dreamland Margate",
  "Lake Compounce",
  "Otherworld",
  "Unknown Mortal Park",
  "Q-Park",
  "McDonaldland",
];

function sortedTable(table: Record<string, Record<string, string>>): Record<string, string[]> {
  return Object.fromEntries(
    Object.keys(table)
      .sort()
      .map((park) => [park, Object.keys(table[park]!).sort()]),
  );
}

export function buildCatalogHiddenRules(): CatalogHiddenRules {
  return {
    version: CATALOG_HIDDEN_RULES_VERSION,
    skipWikidataCoasterIds: skippedWikidataCoasterIds(),
    misattributedRows: sortedTable(MISATTRIBUTED_ROWS),
    nonCoasterRows: sortedTable(NON_COASTER_ROWS),
    placeholderParkNames: [...PLACEHOLDER_PARK_NAMES],
    hiddenParkNameExamples: PARK_NAME_EXAMPLES.map((name) => ({
      name,
      hidden: isCatalogHiddenParkName(name),
    })),
  };
}

/** Stable JSON text (2-space indent, trailing newline) so the shared copy diffs cleanly. */
export function serializeCatalogHiddenRules(rules: CatalogHiddenRules): string {
  return `${JSON.stringify(rules, null, 2)}\n`;
}
