import { describe, expect, it } from "vitest";
import {
  GUIDES,
  GUIDE_AUTHORS,
  type GuideMeta,
  getGuide,
  guideAuthor,
  guidePath,
  guideUpdated,
  latestGuides,
} from "@/lib/guides";
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

function meta(partial: Partial<GuideMeta>): GuideMeta {
  return {
    slug: "x",
    title: "X",
    description: "d",
    summary: "s",
    published: "2026-01-01",
    readingMinutes: 5,
    keywords: [],
    ...partial,
  };
}

describe("guide authors", () => {
  it("only credits named authors that exist", () => {
    for (const guide of GUIDES) {
      if (guide.author) expect(GUIDE_AUTHORS[guide.author]).toBeTruthy();
    }
    expect(guideAuthor(meta({}))).toBeNull();
    expect(guideAuthor(meta({ author: "founder" }))?.url).toBe("/u/CoasterTrak");
  });

  it("keeps the founder byline off the house guides", () => {
    const house = GUIDES.filter((g) => g.published === "2026-10-06");
    expect(house.length).toBe(6);
    expect(house.every((g) => !g.author)).toBe(true);
  });

  it("uses updated over published and lists newest first", () => {
    expect(guideUpdated(meta({ updated: "2026-03-01" }))).toBe("2026-03-01");
    const list = latestGuides(2, [
      meta({ slug: "old", published: "2026-01-01" }),
      meta({ slug: "new", published: "2026-05-01" }),
      meta({ slug: "edited", published: "2025-01-01", updated: "2026-06-01" }),
    ]);
    expect(list.map((g) => g.slug)).toEqual(["edited", "new"]);
  });
});
