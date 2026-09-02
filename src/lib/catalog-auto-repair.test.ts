import { describe, expect, it } from "vitest";

import { detectSwappedHeightLength } from "@/lib/catalog-auto-repair";

describe("detectSwappedHeightLength", () => {
  it("detects Orkanen-style swaps", () => {
    expect(detectSwappedHeightLength(1486, 63)).toEqual({ height_ft: 63, length_ft: 1486 });
  });

  it("detects Lynet-style swaps", () => {
    expect(detectSwappedHeightLength(1772, 66)).toEqual({ height_ft: 66, length_ft: 1772 });
  });

  it("ignores plausible pairs", () => {
    expect(detectSwappedHeightLength(200, 3000)).toBeNull();
    expect(detectSwappedHeightLength(63, 1486)).toBeNull();
  });
});
