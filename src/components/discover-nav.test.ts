import { describe, expect, it } from "vitest";

import { isDiscoverPath } from "@/lib/discover";

describe("isDiscoverPath", () => {
  it("treats map, parks, and coasters as Discover", () => {
    expect(isDiscoverPath("/map")).toBe(true);
    expect(isDiscoverPath("/parks")).toBe(true);
    expect(isDiscoverPath("/parks/alton-towers-1")).toBe(true);
    expect(isDiscoverPath("/coasters")).toBe(true);
    expect(isDiscoverPath("/coasters/nemesis-2")).toBe(true);
    expect(isDiscoverPath("/discover")).toBe(true);
  });

  it("does not treat account or friends as Discover", () => {
    expect(isDiscoverPath("/friends")).toBe(false);
    expect(isDiscoverPath("/stats")).toBe(false);
    expect(isDiscoverPath("/")).toBe(false);
  });
});
