import { describe, expect, it } from "vitest";
import { normalizeRcdbId, rcdbCoasterUrl } from "./rcdb";

describe("normalizeRcdbId", () => {
  it("accepts numeric ids", () => {
    expect(normalizeRcdbId("2832")).toBe("2832");
    expect(normalizeRcdbId(" 1576 ")).toBe("1576");
  });

  it("extracts id from rcdb.com urls", () => {
    expect(normalizeRcdbId("https://rcdb.com/2832.htm")).toBe("2832");
  });

  it("rejects invalid values", () => {
    expect(normalizeRcdbId(null)).toBeNull();
    expect(normalizeRcdbId("")).toBeNull();
    expect(normalizeRcdbId("0")).toBeNull();
    expect(normalizeRcdbId("abc")).toBeNull();
  });
});

describe("rcdbCoasterUrl", () => {
  it("builds deep-link urls", () => {
    expect(rcdbCoasterUrl("2832")).toBe("https://rcdb.com/2832.htm");
    expect(rcdbCoasterUrl(null)).toBeNull();
  });
});
