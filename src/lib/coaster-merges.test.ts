import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MERGED_COASTER_IDS, resolveMergedCoasterId } from "./coaster-merges";

describe("merged coaster redirects", () => {
  it("sends merged ids to the surviving ride and leaves others alone", () => {
    expect(resolveMergedCoasterId(15675)).toBe(4385);
    expect(resolveMergedCoasterId(4385)).toBe(4385);
    expect(resolveMergedCoasterId(1416)).toBe(1416);
  });

  it("never points at another merged row", () => {
    for (const keep of Object.values(MERGED_COASTER_IDS)) {
      expect(MERGED_COASTER_IDS[keep]).toBeUndefined();
    }
  });

  it("matches the merge migration exactly", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261104120000_merge_same_ride_duplicates.sql"),
      "utf8",
    );
    const pairs = [...sql.matchAll(/^\s*\((\d+), (\d+)\)[,;]/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(pairs).toHaveLength(28);
    expect(Object.fromEntries(pairs)).toEqual(MERGED_COASTER_IDS);
  });
});
