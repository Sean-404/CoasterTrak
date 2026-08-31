import { describe, expect, it } from "vitest";
import { canonicalCountryLabel, reconcileCountryWithCoords } from "@/lib/geo-country";

describe("Hong Kong / Macau country labels", () => {
  it("canonicalizes Hong Kong aliases", () => {
    expect(canonicalCountryLabel("Hong Kong")).toBe("Hong Kong");
    expect(canonicalCountryLabel("Hong Kong SAR")).toBe("Hong Kong");
    expect(canonicalCountryLabel("HK")).toBe("Hong Kong");
  });

  it("does not leave Hong Kong parks labeled as China", () => {
    // Hong Kong Disneyland
    expect(reconcileCountryWithCoords("China", 22.3102, 114.0425)).toBe("Hong Kong");
    // Ocean Park Hong Kong
    expect(reconcileCountryWithCoords("China", 22.2357, 114.1725)).toBe("Hong Kong");
  });

  it("does not re-label mainland China parks", () => {
    // Shanghai Disneyland-ish coords
    expect(reconcileCountryWithCoords("China", 31.143, 121.658)).toBe("China");
  });

  it("labels Macau parks separately from China", () => {
    expect(reconcileCountryWithCoords("China", 22.15, 113.56)).toBe("Macau");
  });
});

describe("Taiwan country labels", () => {
  it("canonicalizes Taiwan aliases", () => {
    expect(canonicalCountryLabel("Taiwan")).toBe("Taiwan");
    expect(canonicalCountryLabel("Chinese Taipei")).toBe("Taiwan");
    expect(canonicalCountryLabel("Republic of China")).toBe("Taiwan");
  });

  it("does not leave Taiwan parks labeled as China", () => {
    // Janfusun Fancyworld
    expect(reconcileCountryWithCoords("China", 23.6181, 120.5772)).toBe("Taiwan");
  });

  it("does not re-label mainland China parks near the strait", () => {
    // Xiamen area
    expect(reconcileCountryWithCoords("China", 24.48, 118.08)).toBe("China");
  });
});

describe("Canada country labels", () => {
  it("corrects US-labeled parks in southern Quebec", () => {
    // La Ronde, Montreal
    expect(reconcileCountryWithCoords("United States", 45.503, -73.534)).toBe("Canada");
  });

  it("does not re-label northern US parks as Canada", () => {
    // Kings Island, Ohio
    expect(reconcileCountryWithCoords("United States", 39.344, -84.268)).toBe("United States");
  });
});
