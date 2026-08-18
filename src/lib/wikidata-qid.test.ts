import { describe, expect, it } from "vitest";
import { humanWikidataLabel, isWikidataQidLabel } from "@/lib/wikidata-qid";

describe("isWikidataQidLabel", () => {
  it("detects bare entity ids", () => {
    expect(isWikidataQidLabel("Q2197655")).toBe(true);
    expect(isWikidataQidLabel("q122460556")).toBe(true);
    expect(isWikidataQidLabel("  Q1  ")).toBe(true);
  });

  it("leaves real names alone", () => {
    expect(isWikidataQidLabel("Plopsaland Ardennes")).toBe(false);
    expect(isWikidataQidLabel("Schtroumpfeur")).toBe(false);
    expect(isWikidataQidLabel("")).toBe(false);
    expect(isWikidataQidLabel(null)).toBe(false);
  });
});

describe("humanWikidataLabel", () => {
  it("returns null for Q-id fallbacks", () => {
    expect(humanWikidataLabel("Q2197655")).toBeNull();
    expect(humanWikidataLabel("   ")).toBeNull();
  });

  it("keeps language labels", () => {
    expect(humanWikidataLabel("Plopsaland Ardennes")).toBe("Plopsaland Ardennes");
    expect(humanWikidataLabel(" Wickie The Ride ")).toBe("Wickie The Ride");
  });
});
