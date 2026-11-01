import { describe, expect, it } from "vitest";
import {
  applyCatalogQualityDismissals,
  catalogReviewDismissKey,
  openAiAssessments,
  type CatalogReviewItem,
  type CatalogReviewQueue,
} from "@/lib/catalog-quality-storage";

describe("openAiAssessments", () => {
  const items = [
    { type: "SUSPICIOUS_VALUE", entityType: "coaster", entityId: "coaster_db_15817", entityName: "Jumbo Jet", field: "status" },
    { type: "SUSPICIOUS_VALUE", entityType: "coaster", entityId: "coaster_db_99", entityName: "Other", field: "status" },
    { type: "POSSIBLE_DUPLICATE", entityType: "coaster", entityA: "a", entityB: "b", nameA: "A" },
  ] as CatalogReviewItem[];
  const ai = [
    { itemKey: "suspicious_value:coaster_db_15817" },
    { itemKey: "suspicious_value:coaster_db_99" },
    { itemKey: "dup:a:b" },
  ];

  it("keeps AI flags whose review item is open, matching the pipeline's item keys", () => {
    expect(openAiAssessments(ai, items).map((a) => a.itemKey)).toEqual(ai.map((a) => a.itemKey));
  });

  it("drops the AI flag once its review item is dismissed", () => {
    const dismissed = new Set([catalogReviewDismissKey(items[0]!)]);
    const { reviewQueue } = applyCatalogQualityDismissals(
      { report: null, reviewQueue: { items } as unknown as CatalogReviewQueue },
      dismissed,
    );
    expect(openAiAssessments(ai, reviewQueue!.items).map((a) => a.itemKey)).toEqual([
      "suspicious_value:coaster_db_99",
      "dup:a:b",
    ]);
  });
});
