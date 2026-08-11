import { describe, expect, it } from "vitest";
import {
  catalogHref,
  catalogTotalPages,
  clampCatalogPage,
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
    expect(page1.items).toHaveLength(100);
    expect(page1.from).toBe(1);
    expect(page1.to).toBe(100);
    expect(page1.totalPages).toBe(3);

    const page3 = sliceCatalogPage(items, 3);
    expect(page3.items).toEqual(Array.from({ length: 50 }, (_, i) => i + 201));
    expect(page3.from).toBe(201);
    expect(page3.to).toBe(250);
  });

  it("clamps out-of-range pages", () => {
    expect(clampCatalogPage(99, 250)).toBe(3);
    expect(catalogTotalPages(0)).toBe(1);
  });

  it("builds hrefs without page=1", () => {
    expect(catalogHref("/coasters", { page: 1 })).toBe("/coasters");
    expect(catalogHref("/coasters", { q: "nemesis", page: 2 })).toBe("/coasters?q=nemesis&page=2");
  });
});
