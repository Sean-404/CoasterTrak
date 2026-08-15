import { describe, expect, it } from "vitest";

import {
  applyKnownFixesToWikidataRow,
  applyWikidataFieldOverrides,
  buildWikidataFieldOverrideMap,
} from "@/lib/coastertrak-data/publish/enrich-snapshot";
import { makeRow } from "@/lib/coastertrak-data/test-helpers";

describe("enrichWikidata snapshot", () => {
  it("applies known fixes by wikidata id", () => {
    const row = applyKnownFixesToWikidataRow(
      makeRow({
        wikidataId: "Q885702",
        label: "Zipper Dipper",
        parkLabel: "Blackpool Pleasure Beach",
        status: "unknown",
      }),
    );
    expect(row.label).toBe("Blue Flyer");
    expect(row.status).toBe("operating");
  });

  it("marks Six Flags America Ride of Steel and Vertigorama defunct", () => {
    const rideOfSteel = applyKnownFixesToWikidataRow(
      makeRow({
        wikidataId: "Q839200",
        label: "Ride of Steel",
        parkLabel: "Six Flags America",
        status: "operating",
      }),
    );
    expect(rideOfSteel.status).toBe("defunct");

    const vertigorama = applyKnownFixesToWikidataRow(
      makeRow({
        wikidataId: "Q2518728",
        label: "Vertigorama",
        parkLabel: "Argentina, Villa Soldati, Buenos Aires",
        status: "operating",
      }),
    );
    expect(vertigorama.status).toBe("defunct");
    expect(vertigorama.coasterTypeLabel).toBe("Steel");
    expect(vertigorama.manufacturerLabel).toBe("Intamin");
    expect(vertigorama.inversions).toBe(0);
  });

  it("applies DB field overrides keyed by wikidata id", () => {
    const overrides = buildWikidataFieldOverrideMap([
      {
        coaster_id: 1,
        field_name: "height_ft",
        value_int: 66,
        value_text: null,
        wikidata_id: "Q123",
        approved: true,
      },
    ]);

    const row = applyWikidataFieldOverrides(
      makeRow({ wikidataId: "Q123", label: "Wicker Man", heightFt: 50 }),
      overrides,
    );
    expect(row.heightFt).toBe(66);
  });
});
