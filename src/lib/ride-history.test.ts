import { describe, expect, it } from "vitest";
import { evaluateAchievements, ridesChronologicalUnique } from "./achievements";
import {
  buildStatsCopyText,
  formatRideCount,
  formatRideOnDate,
  localDateISO,
  migrateCreditsToEvents,
  mostRiddenCoaster,
  parseRideQuantity,
  sortRideDayLogs,
  summarizeRideEvents,
  type RideEvent,
} from "./ride-history";

const USER = "user-1";

function event(coasterId: number, riddenOn: string | null, quantity: number): RideEvent {
  return { userId: USER, coasterId, riddenOn, quantity };
}

describe("parseRideQuantity", () => {
  it("accepts whole numbers in range", () => {
    expect(parseRideQuantity(1)).toBe(1);
    expect(parseRideQuantity(12)).toBe(12);
    expect(parseRideQuantity("3")).toBe(3);
    expect(parseRideQuantity(99)).toBe(99);
  });

  it("rejects invalid ride counts", () => {
    expect(parseRideQuantity(0)).toBeNull();
    expect(parseRideQuantity(-1)).toBeNull();
    expect(parseRideQuantity(1.5)).toBeNull();
    expect(parseRideQuantity(100)).toBeNull();
    expect(parseRideQuantity("foo")).toBeNull();
    expect(parseRideQuantity(null)).toBeNull();
    expect(parseRideQuantity(true)).toBeNull();
  });
});

describe("summarizeRideEvents", () => {
  it("counts first ride as one unique coaster and one total ride", () => {
    const summary = summarizeRideEvents([event(1, "2026-06-14", 1)]);
    expect(summary.uniqueCoasters).toBe(1);
    expect(summary.totalRides).toBe(1);
    expect(summary.byCoaster.get(1)).toMatchObject({
      totalRides: 1,
      firstRiddenOn: "2026-06-14",
      lastRiddenOn: "2026-06-14",
    });
  });

  it("adds another ride on an existing coaster without changing unique count", () => {
    const summary = summarizeRideEvents([
      event(1, "2026-06-14", 3),
      event(2, "2026-07-01", 2),
      event(3, "2026-07-02", 1),
    ]);
    expect(summary.uniqueCoasters).toBe(3);
    expect(summary.totalRides).toBe(6);

    const afterAnotherVeloci = summarizeRideEvents([
      event(1, "2026-06-14", 3),
      event(1, "2026-08-08", 1),
      event(2, "2026-07-01", 2),
      event(3, "2026-07-02", 1),
    ]);
    expect(afterAnotherVeloci.uniqueCoasters).toBe(3);
    expect(afterAnotherVeloci.totalRides).toBe(7);
    expect(afterAnotherVeloci.byCoaster.get(1)?.firstRiddenOn).toBe("2026-06-14");
    expect(afterAnotherVeloci.byCoaster.get(1)?.lastRiddenOn).toBe("2026-08-08");
  });

  it("supports multiple rides on the same day via quantity", () => {
    const summary = summarizeRideEvents([event(10, "2026-08-08", 4)]);
    expect(summary.uniqueCoasters).toBe(1);
    expect(summary.totalRides).toBe(4);
    expect(summary.byDate.get("2026-08-08")).toEqual([{ coasterId: 10, quantity: 4 }]);
  });

  it("supports multiple dates and groups by day for future calendars", () => {
    const summary = summarizeRideEvents([
      event(1, "2026-08-08", 3),
      event(2, "2026-08-08", 2),
      event(1, "2026-08-09", 1),
    ]);
    expect(summary.byDate.get("2026-08-08")).toEqual([
      { coasterId: 1, quantity: 3 },
      { coasterId: 2, quantity: 2 },
    ]);
    expect(summary.byDate.get("2026-08-09")).toEqual([{ coasterId: 1, quantity: 1 }]);
  });

  it("does not count an undated placeholder once a real ride day exists", () => {
    const summary = summarizeRideEvents([
      event(1, null, 1),
      event(1, "2026-05-13", 3),
    ]);
    expect(summary.uniqueCoasters).toBe(1);
    expect(summary.totalRides).toBe(3);
    expect(summary.byCoaster.get(1)?.firstRiddenOn).toBe("2026-05-13");
    expect(summary.byCoaster.get(1)?.lastRiddenOn).toBe("2026-05-13");
    expect(summary.byDate.has("")).toBe(false);
    expect(summary.byDate.size).toBe(1);
  });

  it("ignores invalid quantities", () => {
    const summary = summarizeRideEvents([
      event(1, "2026-08-08", 2),
      event(2, "2026-08-08", 0),
      event(3, "2026-08-08", -4),
    ]);
    expect(summary.uniqueCoasters).toBe(1);
    expect(summary.totalRides).toBe(2);
  });
});

describe("sortRideDayLogs", () => {
  it("puts newest dated days first and undated credits last", () => {
    expect(
      sortRideDayLogs([
        { id: 1, riddenOn: "2026-05-13", quantity: 3 },
        { id: 2, riddenOn: null, quantity: 1 },
        { id: 3, riddenOn: "2026-08-08", quantity: 2 },
      ]).map((row) => row.id),
    ).toEqual([3, 1, 2]);
  });
});

describe("migrateCreditsToEvents", () => {
  it("turns each existing credit into one undated ride", () => {
    const events = migrateCreditsToEvents([
      { userId: USER, coasterId: 1, riddenAt: "2026-01-01T12:00:00.000Z" },
      { userId: USER, coasterId: 2, riddenAt: "2026-02-01T12:00:00.000Z" },
    ]);
    expect(events).toHaveLength(2);
    expect(events.every((row) => row.riddenOn === null && row.quantity === 1)).toBe(true);
    expect(events.every((row) => row.source === "legacy_credit")).toBe(true);
    expect(events[0]?.createdAt).toBe("2026-01-01T12:00:00.000Z");

    const summary = summarizeRideEvents(events);
    expect(summary.uniqueCoasters).toBe(2);
    expect(summary.totalRides).toBe(2);
    expect(summary.byCoaster.get(1)?.firstRiddenOn).toBeNull();
  });

  it("is idempotent for duplicate credits of the same coaster", () => {
    const once = migrateCreditsToEvents([
      { userId: USER, coasterId: 1, riddenAt: "2026-01-01T12:00:00.000Z" },
    ]);
    const twice = migrateCreditsToEvents([
      { userId: USER, coasterId: 1, riddenAt: "2026-01-01T12:00:00.000Z" },
      { userId: USER, coasterId: 1, riddenAt: "2026-03-01T12:00:00.000Z" },
    ]);
    expect(twice).toHaveLength(once.length);
    expect(summarizeRideEvents(twice).totalRides).toBe(1);
  });

  it("does not invent a ride day from log timestamps", () => {
    const [row] = migrateCreditsToEvents([
      { userId: USER, coasterId: 7, riddenAt: "2026-08-08T23:59:00.000Z" },
    ]);
    expect(row?.riddenOn).toBeNull();
  });
});

describe("mostRiddenCoaster / copy stats", () => {
  it("picks the highest total and keeps unique credits in copy text", () => {
    const summary = summarizeRideEvents([
      event(1, "2026-06-14", 12),
      event(2, "2026-07-01", 8),
      event(3, "2026-07-02", 6),
    ]);
    expect(mostRiddenCoaster(summary.byCoaster)?.coasterId).toBe(1);
    expect(summary.uniqueCoasters).toBe(3);
    expect(summary.totalRides).toBe(26);

    const text = buildStatsCopyText({
      displayName: "Sheen404",
      includeFamilyRides: false,
      uniqueCoasters: summary.uniqueCoasters,
      totalRides: summary.totalRides,
      parksVisited: 15,
      countriesVisited: 5,
      continentsVisited: 2,
      totalTrackLength: "10 mi",
      totalRideTime: "1h",
      totalInversions: "40",
      averageSpeed: "50 mph",
      favoriteRideLabel: "VelociCoaster",
      favoriteParkLabel: "Islands of Adventure",
      mostRidden: { name: "VelociCoaster", rides: 12 },
    });
    expect(text).toContain("Coasters ridden: 3");
    expect(text).toContain("Total rides: 26");
    expect(text).toContain("Most ridden: VelociCoaster (12 rides)");
    expect(text).toContain("Sheen404's CoasterTrak stats");
  });
});

describe("date helpers", () => {
  it("formats YYYY-MM-DD without timezone shift", () => {
    expect(formatRideOnDate("2026-06-14")).toMatch(/14/);
    expect(formatRideOnDate("2026-06-14")).toMatch(/2026/);
    expect(formatRideOnDate(null)).toBeNull();
    expect(formatRideOnDate("not-a-date")).toBeNull();
  });

  it("returns a local YYYY-MM-DD for today", () => {
    expect(localDateISO(new Date(2026, 7, 8))).toBe("2026-08-08");
  });

  it("formats ride counts", () => {
    expect(formatRideCount(1)).toBe("1 time");
    expect(formatRideCount(12)).toBe("12 times");
  });
});

describe("achievements stay unique-credit based", () => {
  it("uses distinct coasters, not total rides", () => {
    const unique = ridesChronologicalUnique([
      { coaster_id: 1, ridden_at: "2026-06-14T00:00:00.000Z" },
      { coaster_id: 1, ridden_at: "2026-08-08T00:00:00.000Z" },
      { coaster_id: 2, ridden_at: "2026-07-01T00:00:00.000Z" },
      { coaster_id: 3, ridden_at: "2026-07-02T00:00:00.000Z" },
    ]);
    expect(unique).toHaveLength(3);
    expect(unique[0]?.coaster_id).toBe(1);

    const evals = evaluateAchievements(unique);
    const first = evals.find((row) => row.id === "first_credit");
    const three = evals.find((row) => row.id === "credits_3");
    const five = evals.find((row) => row.id === "credits_5");
    expect(first?.current).toBe(3);
    expect(first?.unlocked).toBe(true);
    expect(three?.unlocked).toBe(true);
    expect(five?.unlocked).toBe(false);
    expect(five?.current).toBe(3);
  });
});
