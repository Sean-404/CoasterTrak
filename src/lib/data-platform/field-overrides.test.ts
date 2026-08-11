import { describe, expect, it } from "vitest";

import {
  applyFieldOverrides,
  buildFieldOverrideMap,
} from "@/lib/data-platform/field-overrides";
import type { Coaster } from "@/types/domain";

function makeCoaster(overrides: Partial<Coaster> = {}): Coaster {
  return {
    id: 1,
    park_id: 10,
    name: "Wicker Man",
    coaster_type: "Wood",
    status: "Operating",
    height_ft: null,
    ...overrides,
  };
}

describe("field overrides", () => {
  it("applies approved numeric and text overrides", () => {
    const map = buildFieldOverrideMap([
      {
        coaster_id: 1,
        field_name: "height_ft",
        value_int: 66,
        value_text: null,
        source: "official_website",
        approved: true,
      },
      {
        coaster_id: 1,
        field_name: "name",
        value_int: null,
        value_text: "Wicker Man",
        approved: true,
      },
    ]);

    const out = applyFieldOverrides(makeCoaster({ height_ft: 50 }), map);
    expect(out.height_ft).toBe(66);
    expect(out.name).toBe("Wicker Man");
  });

  it("ignores unapproved overrides", () => {
    const map = buildFieldOverrideMap([
      {
        coaster_id: 1,
        field_name: "height_ft",
        value_int: 999,
        value_text: null,
        approved: false,
      },
    ]);

    const out = applyFieldOverrides(makeCoaster({ height_ft: 50 }), map);
    expect(out.height_ft).toBe(50);
  });

  it("ignores unknown field names", () => {
    const map = buildFieldOverrideMap([
      {
        coaster_id: 1,
        field_name: "not_a_real_field",
        value_int: 1,
        value_text: null,
        approved: true,
      },
    ]);

    expect(map.get(1)).toBeUndefined();
  });
});
