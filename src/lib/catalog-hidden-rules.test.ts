import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCatalogHiddenRules,
  CATALOG_HIDDEN_RULES_DATA_PATH,
  serializeCatalogHiddenRules,
} from "./catalog-hidden-rules";
import { isMisattributedRow, isNonCoasterRow } from "./catalog-closures";
import { shouldSkipWikidataCoasterId } from "./coaster-known-fixes";
import { isCatalogHiddenParkName } from "./park-match";

describe("buildCatalogHiddenRules", () => {
  const rules = buildCatalogHiddenRules();

  it("lists every skipped Wikidata id, including the Nuthouse Coaster", () => {
    expect(rules.skipWikidataCoasterIds).toContain("Q3569870");
    for (const q of rules.skipWikidataCoasterIds) {
      expect(shouldSkipWikidataCoasterId(q)).toBe(true);
    }
  });

  it("carries every misattributed row the site hides", () => {
    expect(rules.misattributedRows["Lake Compounce"]).toContain("Recoil");
    expect(rules.misattributedRows["Dreamland Margate"]).toContain("The Great Scenic Railway");
    expect(rules.misattributedRows["Six Flags America"]).toContain(
      "Flashback (Six Flags New England)",
    );
    for (const [park, names] of Object.entries(rules.misattributedRows)) {
      for (const name of names) expect(isMisattributedRow(name, park)).toBe(true);
    }
  });

  it("carries every non-coaster row the site hides", () => {
    for (const [park, names] of Object.entries(rules.nonCoasterRows)) {
      for (const name of names) expect(isNonCoasterRow(name, park)).toBe(true);
    }
    expect(Object.keys(rules.nonCoasterRows).length).toBeGreaterThan(0);
  });

  it("records what isCatalogHiddenParkName says for each example name", () => {
    for (const { name, hidden } of rules.hiddenParkNameExamples) {
      expect(isCatalogHiddenParkName(name), name).toBe(hidden);
    }
    const hidden = rules.hiddenParkNameExamples.filter((e) => e.hidden).map((e) => e.name);
    expect(hidden).toContain("Other");
    expect(hidden).toContain("Unknown / historical park (Japan)");
    expect(hidden).not.toContain("Six Flags America");
  });

  it("serializes the same text every time", () => {
    expect(serializeCatalogHiddenRules(buildCatalogHiddenRules())).toBe(
      serializeCatalogHiddenRules(rules),
    );
  });
});

// Local guard against the two repos drifting apart. Skipped when coastertrak-data is not a
// sibling checkout (CI runs the export before analyze instead).
const dataDir =
  process.env.COASTERTRAK_DATA_DIR?.trim() || resolve(process.cwd(), "..", "coastertrak-data");
const sharedCopy = join(dataDir, CATALOG_HIDDEN_RULES_DATA_PATH);

describe.skipIf(!existsSync(sharedCopy))("coastertrak-data copy of the rules", () => {
  it("matches the rules built here (run scripts/export-catalog-hidden-rules.ts)", () => {
    const onDisk = readFileSync(sharedCopy, "utf8").replace(/\r\n/g, "\n");
    expect(onDisk).toBe(serializeCatalogHiddenRules(buildCatalogHiddenRules()));
  });
});
