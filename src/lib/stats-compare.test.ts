import { describe, expect, it } from "vitest";
import {
  buildCompareTotals,
  buildCreditOverlap,
  buildParkHeadToHead,
  compareDelta,
  creditsForPark,
  dedupeCompareCredits,
  filterCompareCredits,
  formatCompareDuration,
  formatRecordDetail,
  parkKeyForCredit,
  toCompareCredit,
  type CompareCredit,
} from "./stats-compare";

function credit(partial: Partial<CompareCredit> & { coasterId: number; name: string }): CompareCredit {
  return {
    parkId: 1,
    parkName: "Alton Towers",
    country: "United Kingdom",
    lengthFt: 2000,
    speedMph: 50,
    heightFt: 100,
    inversions: 0,
    durationS: 90,
    totalRides: 1,
    thrill: true,
    ...partial,
  };
}

describe("stats-compare", () => {
  it("dedupes by coaster id and keeps the first row", () => {
    const rows = [
      credit({ coasterId: 1, name: "Nemesis", totalRides: 3 }),
      credit({ coasterId: 1, name: "Nemesis duplicate", totalRides: 9 }),
      credit({ coasterId: 2, name: "Wicker Man" }),
    ];
    expect(dedupeCompareCredits(rows).map((row) => row.coasterId)).toEqual([1, 2]);
    expect(dedupeCompareCredits(rows)[0]?.totalRides).toBe(3);
  });

  it("filters family rides unless they are included", () => {
    const rows = [
      credit({ coasterId: 1, name: "Nemesis", thrill: true }),
      credit({ coasterId: 2, name: "Octonauts", thrill: false }),
    ];
    expect(filterCompareCredits(rows, false).map((row) => row.coasterId)).toEqual([1]);
    expect(filterCompareCredits(rows, true).map((row) => row.coasterId)).toEqual([1, 2]);
  });

  it("splits overlap into both / only you / only them", () => {
    const mine = [
      credit({ coasterId: 1, name: "Nemesis" }),
      credit({ coasterId: 2, name: "Wicker Man" }),
    ];
    const theirs = [
      credit({ coasterId: 2, name: "Wicker Man" }),
      credit({ coasterId: 3, name: "Thirteen" }),
    ];
    const overlap = buildCreditOverlap(mine, theirs);
    expect(overlap.both.map((row) => row.coasterId)).toEqual([2]);
    expect(overlap.onlyYou.map((row) => row.coasterId)).toEqual([1]);
    expect(overlap.onlyThem.map((row) => row.coasterId)).toEqual([3]);
  });

  it("scopes overlap to a park", () => {
    const mine = [
      credit({ coasterId: 1, name: "Nemesis", parkId: 10, parkName: "Alton Towers" }),
      credit({ coasterId: 4, name: "Stealth", parkId: 20, parkName: "Thorpe Park" }),
    ];
    const alton = creditsForPark(mine, "id:10");
    expect(alton.map((row) => row.coasterId)).toEqual([1]);
  });

  it("builds park head-to-head with missing-ride lists, them-ahead first on equal gap", () => {
    const mine = [
      credit({ coasterId: 1, name: "Nemesis", parkId: 10, parkName: "Alton Towers" }),
      credit({ coasterId: 4, name: "Stealth", parkId: 20, parkName: "Thorpe Park" }),
    ];
    const theirs = [
      credit({ coasterId: 1, name: "Nemesis", parkId: 10, parkName: "Alton Towers" }),
      credit({ coasterId: 2, name: "Wicker Man", parkId: 10, parkName: "Alton Towers" }),
      credit({ coasterId: 3, name: "Oblivion", parkId: 10, parkName: "Alton Towers" }),
    ];
    const parks = buildParkHeadToHead(mine, theirs);
    expect(parks[0]?.label).toContain("Alton Towers");
    expect(parks[0]?.mineCount).toBe(1);
    expect(parks[0]?.theirsCount).toBe(3);
    expect(parks[0]?.onlyTheirs.map((row) => row.name)).toEqual(["Oblivion", "Wicker Man"]);
    expect(parks[0]?.delta.label).toBe("+2 them");
    expect(parks[1]?.label).toContain("Thorpe Park");
    expect(parks[1]?.onlyMine).toHaveLength(1);
  });

  it("formats numeric deltas from your side", () => {
    expect(compareDelta(412, 387).label).toBe("+25 you");
    expect(compareDelta(10, 18).label).toBe("+8 them");
    expect(compareDelta(4, 4)).toEqual({
      mine: 4,
      theirs: 4,
      delta: 0,
      winner: "tie",
      label: "Tied",
    });
  });

  it("computes named records and unique totals", () => {
    const credits = [
      credit({
        coasterId: 1,
        name: "Steel Vengeance",
        parkId: 5,
        parkName: "Cedar Point",
        country: "United States",
        speedMph: 74,
        heightFt: 205,
        lengthFt: 5740,
        inversions: 4,
        durationS: 150,
        totalRides: 2,
      }),
      credit({
        coasterId: 2,
        name: "Nemesis",
        parkId: 10,
        parkName: "Alton Towers",
        country: "United Kingdom",
        speedMph: 50,
        heightFt: 50,
        lengthFt: 2349,
        inversions: 4,
        durationS: 80,
        totalRides: 6,
      }),
    ];
    const totals = buildCompareTotals(credits);
    expect(totals.uniqueCoasters).toBe(2);
    expect(totals.totalRides).toBe(8);
    expect(totals.parks).toBe(2);
    expect(totals.countries).toBe(2);
    expect(totals.continents).toBe(2);
    expect(totals.fastest?.name).toBe("Steel Vengeance");
    expect(totals.mostRidden?.name).toBe("Nemesis");
    expect(totals.mostRidden?.value).toBe(6);
    expect(formatRecordDetail(totals.fastest, (value) => `${value} mph`)).toBe(
      "Steel Vengeance (74 mph) · Cedar Point",
    );
  });

  it("formats long totals with hours", () => {
    expect(formatCompareDuration(0)).toBe("—");
    expect(formatCompareDuration(45)).toBe("45s");
    expect(formatCompareDuration(80)).toBe("1m 20s");
    expect(formatCompareDuration(3720)).toBe("1h 2m");
  });

  it("treats high-speed rides as thrill in toCompareCredit", () => {
    const thrill = toCompareCredit({
      coasterId: 1,
      name: "Stealth",
      speedMph: 80,
      heightFt: 205,
      coasterType: "Launcher",
    });
    const family = toCompareCredit({
      coasterId: 2,
      name: "Junior Coaster",
      coasterType: "Family kiddie coaster",
      speedMph: 16,
      heightFt: 20,
      lengthFt: 400,
    });
    expect(thrill.thrill).toBe(true);
    expect(family.thrill).toBe(false);
  });

  it("uses park id for grouping when present", () => {
    const row = credit({ coasterId: 1, name: "Nemesis", parkId: 348, parkName: "Plopsaland Ardennes" });
    expect(parkKeyForCredit(row)).toBe("id:348");
  });
});
