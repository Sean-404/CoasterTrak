import { describe, expect, it } from "vitest";
import {
  PRODUCT_UPDATES,
  formatProductUpdateDate,
  hasUnseenProductUpdates,
  latestProductUpdate,
} from "./product-updates";

describe("product updates", () => {
  it("lists updates newest first with a latest helper", () => {
    expect(PRODUCT_UPDATES.length).toBeGreaterThan(0);
    const latest = latestProductUpdate();
    expect(latest).toEqual(PRODUCT_UPDATES[0]);
    for (let i = 1; i < PRODUCT_UPDATES.length; i++) {
      expect(PRODUCT_UPDATES[i - 1]!.id >= PRODUCT_UPDATES[i]!.id).toBe(true);
    }
  });

  it("detects unseen updates from last-seen id", () => {
    const latest = latestProductUpdate();
    expect(latest).not.toBeNull();
    expect(hasUnseenProductUpdates(null)).toBe(true);
    expect(hasUnseenProductUpdates(undefined)).toBe(true);
    expect(hasUnseenProductUpdates("older-id")).toBe(true);
    expect(hasUnseenProductUpdates(latest!.id)).toBe(false);
  });

  it("formats ISO dates for display", () => {
    expect(formatProductUpdateDate("2026-09-04")).toMatch(/September/);
    expect(formatProductUpdateDate("not-a-date")).toBe("not-a-date");
  });
});
