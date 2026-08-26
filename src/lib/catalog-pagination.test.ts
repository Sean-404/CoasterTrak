import { describe, expect, it } from "vitest";
import {
  catalogHref,
  catalogTotalPages,
  clampCatalogPage,
  isCatalogIndexCrawlVariant,
  parseCatalogPage,
  sliceCatalogPage,
} from "./catalog-pagination";

describe("catalog-pagination", () => {
  it("parses page numbers safely", () => {
    expect(parseCatalogPage(undefined)).toBe(1);
    expect(parseCatalogPage("3")).toBe(3);
    expect(parseCatalogPage("0")).toBe(1);
    expect(parseCatalogPage("-2")).toBe(1);
    expect(parseCatalogPage("nope")).toBe(1);
  });

  it("slices pages and reports ranges", () => {
    const items = Array.from({ length: 250 }, (_, i) => i + 1);
    const page1 = sliceCatalogPage(items, 1);
    expect(page1.items).toHaveLength(50);
    expect(page1.from).toBe(1);
    expect(page1.to).toBe(50);
    expect(page1.totalPages).toBe(5);

    const page5 = sliceCatalogPage(items, 5);
    expect(page5.items).toEqual(Array.from({ length: 50 }, (_, i) => i + 201));
    expect(page5.from).toBe(201);
    expect(page5.to).toBe(250);
  });

  it("clamps out-of-range pages", () => {
    expect(clampCatalogPage(99, 250)).toBe(5);
    expect(catalogTotalPages(0)).toBe(1);
  });

  it("builds hrefs without page=1", () => {
    expect(catalogHref("/coasters", { page: 1 })).toBe("/coasters");
    expect(catalogHref("/coasters", { q: "nemesis", page: 2 })).toBe("/coasters?q=nemesis&page=2");
    expect(catalogHref("/parks", { country: "United Kingdom", page: 2 })).toBe(
      "/parks?country=United+Kingdom&page=2",
    );
    expect(catalogHref("/parks", { q: "alton", country: "United Kingdom" })).toBe(
      "/parks?q=alton&country=United+Kingdom",
    );
  });

  it("flags faceted / paginated index URLs for noindex", () => {
    expect(isCatalogIndexCrawlVariant({})).toBe(false);
    expect(isCatalogIndexCrawlVariant({ page: 1 })).toBe(false);
    expect(isCatalogIndexCrawlVariant({ page: 2 })).toBe(true);
    expect(isCatalogIndexCrawlVariant({ q: "nemesis" })).toBe(true);
    expect(isCatalogIndexCrawlVariant({ country: "United Kingdom" })).toBe(true);
    expect(isCatalogIndexCrawlVariant({ q: "  " })).toBe(false);
  });
});
