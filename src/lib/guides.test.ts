import { describe, expect, it } from "vitest";
import { GUIDES, getGuide, guidePath } from "@/lib/guides";
import { GUIDE_BODIES } from "@/content/guides";

describe("guides registry", () => {
  it("has unique slugs and matching bodies", () => {
    const slugs = GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const guide of GUIDES) {
      expect(GUIDE_BODIES[guide.slug]).toBeTruthy();
      expect(getGuide(guide.slug)?.title).toBe(guide.title);
      expect(guidePath(guide.slug)).toBe(`/guides/${guide.slug}`);
    }
  });

  it("includes substantial reading time for AdSense-oriented guides", () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(6);
    for (const guide of GUIDES) {
      expect(guide.readingMinutes).toBeGreaterThanOrEqual(5);
      expect(guide.description.length).toBeGreaterThan(80);
    }
  });
});
