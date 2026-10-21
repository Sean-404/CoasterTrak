import { describe, expect, it } from "vitest";

import { buildAliasLookup } from "@/lib/data-platform/coaster-aliases";
import {
  assessThemeParksPark,
  decideStatusVerdict,
  downgradeLeakedEntities,
  parseApprovalList,
  parseOverpassParkGroups,
  selectOverrideWrites,
  themeParksCoverage,
  type EvidenceCoaster,
  type Lifecycle,
  type StatusProposal,
} from "@/lib/data-platform/status-evidence";

const aliases = buildAliasLookup([]);
const park = { id: 1, name: "Cedar Point", country: "US", latitude: 41.48, longitude: -82.68 };

function coaster(id: number, name: string, lifecycle: Lifecycle, extra: Partial<EvidenceCoaster> = {}): EvidenceCoaster {
  return { id, park_id: 1, name, status: lifecycle, lifecycle, wikidata_id: null, opening_year: null, closing_year: null, ...extra };
}

const feed = ["Millennium Force", "Steel Vengeance", "Magnum XL-200", "Maverick", "Gemini", "Raptor"].map((name, i) => ({
  id: `e${i}`,
  name,
  entityType: "ATTRACTION",
}));

function assess(coasters: EvidenceCoaster[], attractions = feed) {
  return assessThemeParksPark({
    park,
    coasters,
    themeParksParkId: "tp-park",
    themeParksParkName: "Cedar Point",
    parkMatchMethod: "cached",
    parkMatchConfidence: 1,
    attractions,
    live: new Map(),
    fetchedAt: "2026-10-21T00:00:00Z",
    aliasLookup: aliases,
  });
}

describe("themeParksCoverage", () => {
  it("only trusts absence when the feed contains most confirmed-operating rides", () => {
    expect(themeParksCoverage(80, 10, 9).covered).toBe(true);
    expect(themeParksCoverage(80, 10, 3).covered).toBe(false);
    expect(themeParksCoverage(80, 0, 0).covered).toBe(false);
    expect(themeParksCoverage(2, 1, 1).covered).toBe(false);
  });
});

describe("assessThemeParksPark", () => {
  const coasters = [
    coaster(1, "Millennium Force", "Operating"),
    coaster(2, "Steel Vengeance", "Operating"),
    coaster(3, "Magnum XL-200", "Unknown"),
    coaster(4, "Mean Streak", "Unknown"),
  ];

  it("records present entities with the entity URL for unknown rows only", () => {
    const result = assess(coasters);
    expect(result.coverage.covered).toBe(true);
    expect(result.rows).toHaveLength(2);
    const magnum = result.rows.find((r) => r.coasterId === 3)!;
    expect(magnum).toMatchObject({ kind: "present", strength: "strong", entityId: "e2" });
    expect(magnum.kind === "present" && magnum.entityUrl).toBe("https://api.themeparks.wiki/v1/entity/e2");
    expect(result.rows.find((r) => r.coasterId === 4)).toMatchObject({ kind: "absent", parkCovered: true });
  });

  it("downgrades entities that the feed repeats under another park", () => {
    const a = assess(coasters);
    const b = { ...a, parkId: 2, rows: [], attractionIds: ["e2"] };
    const [out] = downgradeLeakedEntities([a, b]);
    expect(out.rows.find((r) => r.coasterId === 3)).toMatchObject({ strength: "weak" });
  });
});

describe("decideStatusVerdict", () => {
  const present = {
    kind: "present" as const,
    coasterId: 3,
    strength: "strong" as const,
    weakReasons: [],
    entityId: "e2",
    entityName: "Magnum XL-200",
    entityUrl: "https://api.themeparks.wiki/v1/entity/e2",
    matchMethod: "exact_key",
    confidence: 1,
    location: { latitude: 41.48, longitude: -82.68 },
    live: null,
    fetchedAt: "2026-10-21T00:00:00Z",
    parkCovered: true,
  };
  const feature = { id: "way/1", name: "Magnum XL-200", names: ["Magnum XL-200"], osmIds: ["way/1"], point: null };
  const base = { coaster: coaster(3, "Magnum XL-200", "Unknown"), currentYear: 2026 };

  it("proposes Operating only for a strong ThemeParks.wiki match", () => {
    expect(decideStatusVerdict({ ...base, themeParks: present })).toMatchObject({ verdict: "propose_operating", appliable: true });
    expect(
      decideStatusVerdict({ ...base, themeParks: { ...present, strength: "weak", weakReasons: ["fuzzy"] } }),
    ).toMatchObject({ verdict: "review_operating", appliable: false });
  });

  it("never applies future openings or OSM conflicts", () => {
    expect(
      decideStatusVerdict({ ...base, coaster: coaster(3, "Magnum XL-200", "Unknown", { opening_year: 2027 }), themeParks: present }),
    ).toMatchObject({ appliable: false });
    expect(
      decideStatusVerdict({ ...base, themeParks: present, osm: { kind: "lifecycle_removed", coasterId: 3, feature, matchMethod: "exact_key" } }),
    ).toMatchObject({ verdict: "conflict", appliable: false });
  });

  it("treats absence as a defunct candidate only in a covered park, and OSM as review-only", () => {
    const absent = { kind: "absent" as const, coasterId: 3, fetchedAt: "", parkCovered: true, coverageReason: "" };
    expect(decideStatusVerdict({ ...base, themeParks: absent })).toMatchObject({ verdict: "review_defunct", appliable: false });
    expect(decideStatusVerdict({ ...base, themeParks: { ...absent, parkCovered: false } }).verdict).toBe("no_evidence");
    expect(
      decideStatusVerdict({ ...base, osm: { kind: "present", coasterId: 3, feature, matchMethod: "exact_key" } }),
    ).toMatchObject({ verdict: "review_operating", appliable: false });
  });
});

describe("parseOverpassParkGroups", () => {
  it("splits flat foreach output into polygons with active and removed coasters", () => {
    const groups = parseOverpassParkGroups([
      { type: "relation", id: 1, tags: { tourism: "theme_park", name: "Cedar Point" } },
      { type: "way", id: 10, tags: { attraction: "roller_coaster", name: "Maverick" } },
      { type: "way", id: 11, tags: { "removed:attraction": "roller_coaster", name: "Mantis" } },
      { type: "relation", id: 2, tags: { tourism: "theme_park", name: "Cedar Point Shores" } },
    ]);
    expect(groups.map((g) => [g.active.length, g.lifecycle.length])).toEqual([[1, 1], [0, 0]]);
  });
});

describe("selectOverrideWrites", () => {
  const proposal = (coasterId: number, appliable: boolean): StatusProposal => ({
    coasterId,
    coasterName: "x",
    parkName: "y",
    verdict: appliable ? "propose_operating" : "review_defunct",
    appliable,
    themeParks: appliable
      ? {
          kind: "present",
          coasterId,
          strength: "strong",
          weakReasons: [],
          entityId: "e",
          entityName: "x",
          entityUrl: "https://api.themeparks.wiki/v1/entity/e",
          matchMethod: "exact_key",
          confidence: 1,
          location: null,
          live: null,
          fetchedAt: "",
          parkCovered: true,
        }
      : null,
  });

  it("writes only approved, appliable, still-unknown rows without an existing override", () => {
    const { writes, skipped } = selectOverrideWrites({
      proposals: [proposal(1, true), proposal(2, false), proposal(3, true), proposal(4, true), proposal(6, true)],
      approvedIds: new Set([1, 2, 3, 4, 5]),
      existingOverrides: [{ coaster_id: 3, value_text: "Defunct", source: "manual" }],
      currentLifecycle: new Map<number, Lifecycle>([[1, "Unknown"], [3, "Unknown"], [4, "Operating"]]),
    });
    expect(writes).toEqual([
      {
        coaster_id: 1,
        field_name: "status",
        value_text: "Operating",
        source: "themeparks_wiki",
        source_url: "https://api.themeparks.wiki/v1/entity/e",
        approved: true,
      },
    ]);
    expect(skipped.map((s) => s.coasterId)).toEqual([2, 3, 4, 5]);
  });

  it("parses approval lists and rejects junk", () => {
    expect([...parseApprovalList("12 # Magnum\n13, 14\n")]).toEqual([12, 13, 14]);
    expect(() => parseApprovalList("abc")).toThrow();
  });
});
