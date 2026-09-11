import { describe, expect, it } from "vitest";

import {
  aliasKeysForStubMerge,
  findFormerNameStubMerges,
} from "./catalog-stub-merge";

describe("findFormerNameStubMerges", () => {
  it("merges Jubilee Odyssey stub into The Odyssey Wikidata row", () => {
    const pairs = findFormerNameStubMerges([
      {
        id: 609,
        park_id: 170,
        name: "Jubilee Odyssey",
        wikidata_id: null,
        status: "Operating",
      },
      {
        id: 15578,
        park_id: 170,
        name: "The Odyssey",
        wikidata_id: "Q1710760",
        status: "Operating",
        height_ft: 167,
      },
    ]);
    expect(pairs).toEqual([
      {
        stubId: 609,
        keepId: 15578,
        stubName: "Jubilee Odyssey",
        keepName: "The Odyssey",
        parkId: 170,
        reason: "dedup_key",
      },
    ]);
  });

  it("merges via approved park alias when names do not share a dedup key", () => {
    const pairs = findFormerNameStubMerges(
      [
        {
          id: 1,
          park_id: 87,
          name: "DareDeviler",
          wikidata_id: null,
          status: "Operating",
        },
        {
          id: 2,
          park_id: 87,
          name: "The Fly",
          wikidata_id: "Q2880135",
          status: "Operating",
        },
      ],
      [{ key_a: "daredeviler", key_b: "fly", park_id: 87, approved: true }],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      stubId: 1,
      keepId: 2,
      reason: "alias",
    });
  });

  it("does not merge across parks or two Wikidata rows", () => {
    expect(
      findFormerNameStubMerges([
        { id: 1, park_id: 1, name: "Dragon", wikidata_id: null },
        { id: 2, park_id: 2, name: "Dragon", wikidata_id: "Q1" },
      ]),
    ).toEqual([]);

    expect(
      findFormerNameStubMerges([
        { id: 1, park_id: 1, name: "Dragon", wikidata_id: "Q1" },
        { id: 2, park_id: 1, name: "Dragon", wikidata_id: "Q2" },
      ]),
    ).toEqual([]);
  });
});

describe("aliasKeysForStubMerge", () => {
  it("orders keys for the aliases table constraint", () => {
    expect(aliasKeysForStubMerge("DareDeviler", "The Fly")).toEqual({
      key_a: "daredeviler",
      key_b: "fly",
    });
  });

  it("skips alias rows when dedup already collapses both names", () => {
    expect(aliasKeysForStubMerge("Jubilee Odyssey", "The Odyssey")).toBeNull();
  });
});
