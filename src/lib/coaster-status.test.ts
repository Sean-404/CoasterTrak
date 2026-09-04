import { describe, expect, it } from "vitest";
import {
  effectiveClosingYear,
  hasPastClosingYear,
  inferParkLifecycleStatus,
  isCoasterDefunct,
  isParkDefunct,
  normalizeLifecycleStatus,
} from "@/lib/coaster-status";

describe("park lifecycle inference", () => {
  it("classifies removed coasters as defunct", () => {
    expect(isCoasterDefunct({ status: "Removed", closing_year: null })).toBe(true);
  });

  it("treats parks with all defunct coasters as defunct", () => {
    const coasters = [
      { status: "Defunct", closing_year: 1999 },
      { status: "Removed", closing_year: null },
    ];
    expect(isParkDefunct(coasters)).toBe(true);
    expect(inferParkLifecycleStatus(coasters)).toBe("Defunct");
  });

  it("does not mark parks defunct when any coaster is operating", () => {
    const coasters = [
      { status: "Defunct", closing_year: 1999 },
      { status: "Operating", closing_year: null },
    ];
    expect(isParkDefunct(coasters)).toBe(false);
    expect(inferParkLifecycleStatus(coasters)).toBe("Operating");
  });

  it("does not mark empty parks as defunct", () => {
    expect(isParkDefunct([])).toBe(false);
    expect(inferParkLifecycleStatus([])).toBe("Unknown");
  });

  it("does not mark parks defunct when statuses are unknown", () => {
    const coasters = [{ status: "Unknown", closing_year: null }];
    expect(isCoasterDefunct(coasters[0])).toBe(false);
    expect(isParkDefunct(coasters)).toBe(false);
    expect(inferParkLifecycleStatus(coasters)).toBe("Unknown");
  });
});

describe("normalizeLifecycleStatus", () => {
  it("treats past closing_year as Defunct even when status says Operating", () => {
    expect(
      normalizeLifecycleStatus("Operating", { closingYear: 1996, openingYear: 1990 }),
    ).toBe("Defunct");
    expect(isCoasterDefunct({ status: "Operating", closing_year: 1996, opening_year: 1990 })).toBe(
      true,
    );
  });

  it("keeps Operating when opening_year is after closing_year (rebuild)", () => {
    expect(
      normalizeLifecycleStatus("Operating", { closingYear: 2010, openingYear: 2024 }),
    ).toBe("Operating");
  });

  it("treats relocated-to as Defunct for park installations", () => {
    expect(normalizeLifecycleStatus("Relocated to Hopi Hari")).toBe("Defunct");
    expect(normalizeLifecycleStatus("Moved to Brazil")).toBe("Defunct");
  });

  it("treats permanently closed as Defunct", () => {
    expect(normalizeLifecycleStatus("Permanently closed")).toBe("Defunct");
  });
});

describe("hasPastClosingYear", () => {
  it("is false when closing year is missing or future", () => {
    expect(hasPastClosingYear({})).toBe(false);
    expect(hasPastClosingYear({ closingYear: 2999 })).toBe(false);
  });
});

describe("effectiveClosingYear", () => {
  it("clears prior-life closing years after a later reopen", () => {
    expect(effectiveClosingYear(2023, 2016)).toBeNull();
    expect(effectiveClosingYear(2007, 2006)).toBeNull();
  });

  it("keeps valid closing years", () => {
    expect(effectiveClosingYear(2007, 2012)).toBe(2012);
    expect(effectiveClosingYear(null, 2012)).toBe(2012);
  });
});
