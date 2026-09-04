import { describe, expect, it } from "vitest";
import {
  buildMonthWrappedSummary,
  buildWrappedSummary,
  formatYearMonthLabel,
  listRecentYearMonths,
  listWrappedPeriodOptions,
  monthDateRange,
  periodDateRange,
  previousYearMonth,
  topRideReasonLabel,
  type MonthWrappedEvent,
  type MonthWrappedRideMeta,
} from "./month-wrapped";

function meta(
  partial: Partial<MonthWrappedRideMeta> & Pick<MonthWrappedRideMeta, "coasterId" | "name">,
): MonthWrappedRideMeta {
  return {
    rating: null,
    parkId: null,
    parkName: null,
    parkCountry: null,
    speedMph: null,
    heightFt: null,
    ...partial,
  };
}

describe("period helpers", () => {
  it("builds inclusive month and year ranges", () => {
    expect(monthDateRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthDateRange("2024-02")?.end).toBe("2024-02-29");
    expect(periodDateRange("2026")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(periodDateRange("2026-08")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("formats and lists months and wrapped options", () => {
    expect(formatYearMonthLabel("2026-08")).toMatch(/August/);
    expect(previousYearMonth(new Date(2026, 8, 4))).toBe("2026-08"); // Sep → Aug
    expect(listRecentYearMonths(3, new Date(2026, 8, 4))).toEqual([
      "2026-09",
      "2026-08",
      "2026-07",
    ]);
    const options = listWrappedPeriodOptions(3, 2, new Date(2026, 8, 4));
    expect(options[0]).toEqual({ value: "2026", label: "2026", scope: "year" });
    expect(options.some((o) => o.value === "2026-09")).toBe(true);
    expect(options.some((o) => o.value === "2025" && o.scope === "year")).toBe(true);
  });
});

describe("buildWrappedSummary", () => {
  const metaMap = new Map<number, MonthWrappedRideMeta>([
    [
      1,
      meta({
        coasterId: 1,
        name: "Nemesis",
        rating: 5,
        parkId: 10,
        parkName: "Alton Towers",
        parkCountry: "United Kingdom",
        heightFt: 42,
        speedMph: 50,
      }),
    ],
    [
      2,
      meta({
        coasterId: 2,
        name: "Oblivion",
        rating: 4,
        parkId: 10,
        parkName: "Alton Towers",
        parkCountry: "United Kingdom",
        heightFt: 180,
        speedMph: 68,
      }),
    ],
    [
      3,
      meta({
        coasterId: 3,
        name: "Steel Vengeance",
        rating: null,
        parkId: 20,
        parkName: "Cedar Point",
        parkCountry: "United States",
        heightFt: 205,
        speedMph: 74,
      }),
    ],
  ]);

  it("returns empty quiet-month summary when no dated rides", () => {
    const summary = buildMonthWrappedSummary("2026-08", [], metaMap);
    expect(summary.empty).toBe(true);
    expect(summary.uniqueCredits).toBe(0);
    expect(summary.topRide).toBeNull();
    expect(summary.scope).toBe("month");
  });

  it("ignores undated and out-of-month events", () => {
    const events: MonthWrappedEvent[] = [
      { coasterId: 1, riddenOn: "2026-07-31", quantity: 2 },
      { coasterId: 2, riddenOn: "2026-09-01", quantity: 2 },
    ];
    expect(buildMonthWrappedSummary("2026-08", events, metaMap).empty).toBe(true);
  });

  it("picks highest rated ride and busiest park for a month", () => {
    const events: MonthWrappedEvent[] = [
      { coasterId: 1, riddenOn: "2026-08-02", quantity: 1 },
      { coasterId: 2, riddenOn: "2026-08-02", quantity: 3 },
      { coasterId: 3, riddenOn: "2026-08-10", quantity: 2 },
    ];
    const summary = buildMonthWrappedSummary("2026-08", events, metaMap);
    expect(summary.empty).toBe(false);
    expect(summary.uniqueCredits).toBe(3);
    expect(summary.totalRides).toBe(6);
    expect(summary.uniqueParks).toBe(2);
    expect(summary.activeDays).toBe(2);
    expect(summary.topRide?.name).toBe("Nemesis");
    expect(summary.topRide?.reason).toBe("highest_rated");
    expect(summary.topPark?.name).toBe("Alton Towers");
    expect(summary.topPark?.ridesInPeriod).toBe(4);
    expect(summary.parks.map((p) => p.name)).toEqual(["Alton Towers", "Cedar Point"]);
    expect(summary.parks[1]?.creditsInPeriod).toBe(1);
    expect(summary.tallestRide?.name).toBe("Steel Vengeance");
    expect(summary.fastestRide?.name).toBe("Steel Vengeance");
  });

  it("builds a full-year summary across months", () => {
    const events: MonthWrappedEvent[] = [
      { coasterId: 1, riddenOn: "2026-03-02", quantity: 1 },
      { coasterId: 2, riddenOn: "2026-08-02", quantity: 3 },
      { coasterId: 3, riddenOn: "2025-12-31", quantity: 9 },
      { coasterId: 3, riddenOn: "2027-01-01", quantity: 9 },
    ];
    const summary = buildWrappedSummary("2026", events, metaMap);
    expect(summary.empty).toBe(false);
    expect(summary.scope).toBe("year");
    expect(summary.period).toBe("2026");
    expect(summary.uniqueCredits).toBe(2);
    expect(summary.totalRides).toBe(4);
    expect(summary.activeDays).toBe(2);
    expect(summary.topRide?.name).toBe("Nemesis");
    expect(summary.topPark?.name).toBe("Alton Towers");
    expect(topRideReasonLabel("highest_rated", "year")).toMatch(/this year/i);
  });

  it("falls back to most ridden when no ratings", () => {
    const noRatings = new Map([
      [3, meta({ coasterId: 3, name: "Steel Vengeance", parkId: 20, parkName: "Cedar Point" })],
      [4, meta({ coasterId: 4, name: "Millennium Force", parkId: 20, parkName: "Cedar Point" })],
    ]);
    const summary = buildMonthWrappedSummary(
      "2026-08",
      [
        { coasterId: 3, riddenOn: "2026-08-01", quantity: 1 },
        { coasterId: 4, riddenOn: "2026-08-01", quantity: 4 },
      ],
      noRatings,
    );
    expect(summary.topRide?.name).toBe("Millennium Force");
    expect(summary.topRide?.reason).toBe("most_ridden");
    expect(topRideReasonLabel("most_ridden")).toMatch(/Most rides dated this month/i);
  });
});
