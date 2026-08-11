import { describe, expect, it } from "vitest";

import { makeRow } from "@/lib/coastertrak-data/test-helpers";
import { sortParkEntriesByCoasterCount } from "@/lib/coastertrak-data/verify/themeparks-snapshot";

describe("sortParkEntriesByCoasterCount", () => {
  it("orders parks by coaster count descending", () => {
    const sorted = sortParkEntriesByCoasterCount([
      ["small", [makeRow({ wikidataId: "Q1", label: "A", parkLabel: "Small Park" })]],
      [
        "big",
        [
          makeRow({ wikidataId: "Q2", label: "B", parkLabel: "Big Park" }),
          makeRow({ wikidataId: "Q3", label: "C", parkLabel: "Big Park" }),
          makeRow({ wikidataId: "Q4", label: "D", parkLabel: "Big Park" }),
        ],
      ],
      [
        "mid",
        [
          makeRow({ wikidataId: "Q5", label: "E", parkLabel: "Mid Park" }),
          makeRow({ wikidataId: "Q6", label: "F", parkLabel: "Mid Park" }),
        ],
      ],
    ]);

    expect(sorted.map(([key]) => key)).toEqual(["big", "mid", "small"]);
  });
});
