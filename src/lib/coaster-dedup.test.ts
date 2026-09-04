import { describe, expect, it } from "vitest";
import {
  coastersShareDedupBucket,
  dedupeCoastersForCatalog,
  isLikelyCoasterEntry,
  normalizeCoasterDedupKey,
} from "./coaster-dedup";
import type { Coaster } from "@/types/domain";

function coaster(partial: Partial<Coaster> & Pick<Coaster, "id" | "name">): Coaster {
  return {
    park_id: 87,
    coaster_type: "Steel",
    manufacturer: null,
    status: "Operating",
    height_ft: null,
    length_ft: null,
    speed_mph: null,
    inversions: null,
    duration_s: null,
    opening_year: null,
    closing_year: null,
    image_url: null,
    wikidata_id: null,
    enwiki_title: null,
    summary_text: null,
    ...partial,
  };
}

describe("normalizeCoasterDedupKey", () => {
  it("collapses Wilde Beast and Wild Beast", () => {
    expect(normalizeCoasterDedupKey("Wilde Beast")).toBe(normalizeCoasterDedupKey("Wild Beast"));
  });

  it("collapses Dragon Fyre and Dragon Fire", () => {
    expect(normalizeCoasterDedupKey("Dragon Fyre")).toBe(normalizeCoasterDedupKey("Dragon Fire"));
  });

  it("does not collapse DareDeviler with The Fly (rename is a known-fix)", () => {
    expect(normalizeCoasterDedupKey("DareDeviler")).not.toBe(normalizeCoasterDedupKey("The Fly"));
  });
});

describe("dedupeCoastersForCatalog", () => {
  it("keeps one Canada's Wonderland spelling twin", () => {
    const rows = [
      coaster({ id: 14678, name: "Wild Beast", wikidata_id: null, coaster_type: "Wood" }),
      coaster({
        id: 193,
        name: "Wilde Beast",
        wikidata_id: "Q8000523",
        coaster_type: "Wood",
        manufacturer: "Taft Broadcasting Company",
      }),
    ];
    const out = dedupeCoastersForCatalog(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(193);
    expect(coastersShareDedupBucket(rows[0]!, rows[1]!)).toBe(true);
  });

  it("keeps one Dragon Fyre / Dragon Fire twin and prefers the Wikidata row", () => {
    const rows = [
      coaster({ id: 14613, name: "Dragon Fire", wikidata_id: null }),
      coaster({ id: 186, name: "Dragon Fyre", wikidata_id: "Q1882515" }),
    ];
    const out = dedupeCoastersForCatalog(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(186);
  });
});

describe("isLikelyCoasterEntry", () => {
  it("keeps Disaster Transport", () => {
    expect(
      isLikelyCoasterEntry(
        coaster({
          id: 4369,
          name: "Disaster Transport",
          wikidata_id: "Q1228345",
          coaster_type: "Steel",
        }),
      ),
    ).toBe(true);
  });

  it("keeps sparse Unknown-type rows that still have a Wikidata id", () => {
    expect(
      isLikelyCoasterEntry(
        coaster({
          id: 15730,
          name: "Golden Loop",
          wikidata_id: "Q28649619",
          coaster_type: "Unknown",
        }),
      ),
    ).toBe(true);
  });

  it("drops Battersea Park funfair disaster", () => {
    expect(
      isLikelyCoasterEntry(
        coaster({
          id: 78,
          name: "Battersea Park funfair disaster",
          wikidata_id: "Q22000267",
        }),
      ),
    ).toBe(false);
  });
});
