import { describe, expect, it } from "vitest";
import {
  inferParkLifecycleStatus,
  isCoasterDefunct,
  isParkDefunct,
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
