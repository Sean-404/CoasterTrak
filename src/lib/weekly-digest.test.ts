import { describe, expect, it } from "vitest";
import {
  buildWeeklyDigestEmail,
  describeActiveFriends,
  shouldSendWeeklyDigest,
  weeklyDigestPeriod,
} from "@/lib/weekly-digest";

describe("weeklyDigestPeriod", () => {
  it("covers the previous Monday to Sunday when run on a Monday morning", () => {
    const period = weeklyDigestPeriod(new Date("2026-11-09T08:00:00Z"));
    expect(period.startDate).toBe("2026-11-02");
    expect(period.endDate).toBe("2026-11-08");
    expect(period.startsAt).toBe("2026-11-02T00:00:00.000Z");
    expect(period.endsBefore).toBe("2026-11-09T00:00:00.000Z");
    expect(period.label).toBe("2 Nov – 8 Nov");
  });

  it("spans a month boundary", () => {
    const period = weeklyDigestPeriod(new Date("2026-10-05T08:00:00Z"));
    expect(period.startDate).toBe("2026-09-28");
    expect(period.endDate).toBe("2026-10-04");
    expect(period.label).toContain("Sep");
    expect(period.label).toContain("Oct");
  });
});

describe("shouldSendWeeklyDigest", () => {
  it("skips empty weeks with no personal or friend activity", () => {
    expect(
      shouldSendWeeklyDigest({
        newCredits: 0,
        totalRides: 0,
        parksVisited: 0,
        friendsActive: 0,
        communityRiders: 40,
      }),
    ).toBe(false);
  });

  it("sends when the rider or a friend logged something", () => {
    expect(
      shouldSendWeeklyDigest({
        newCredits: 2,
        totalRides: 0,
        parksVisited: 0,
        friendsActive: 0,
        communityRiders: 0,
      }),
    ).toBe(true);
    expect(
      shouldSendWeeklyDigest({
        newCredits: 0,
        totalRides: 5,
        parksVisited: 1,
        friendsActive: 0,
        communityRiders: 0,
      }),
    ).toBe(true);
    expect(
      shouldSendWeeklyDigest({
        newCredits: 0,
        totalRides: 0,
        parksVisited: 0,
        friendsActive: 1,
        communityRiders: 12,
      }),
    ).toBe(true);
  });
});

describe("describeActiveFriends", () => {
  it("names one, two or three friends", () => {
    expect(describeActiveFriends(1, ["Alex"])).toBe("Alex logged rides too");
    expect(describeActiveFriends(2, ["Alex", "Sam"])).toBe("Alex and Sam logged rides too");
    expect(describeActiveFriends(3, ["Alex", "Jo", "Sam"])).toBe("Alex, Jo and Sam logged rides too");
  });

  it("counts the rest, including friends without a display name", () => {
    expect(describeActiveFriends(5, ["Alex", "Jo", "Sam", "Zed"])).toBe(
      "Alex, Jo, Sam and 2 more logged rides too",
    );
    expect(describeActiveFriends(2, ["Alex"])).toBe("Alex and 1 more logged rides too");
  });

  it("falls back to a count when no names are known", () => {
    expect(describeActiveFriends(1)).toBe("1 friend logged rides too");
    expect(describeActiveFriends(3, [])).toBe("3 friends logged rides too");
  });
});

describe("buildWeeklyDigestEmail", () => {
  it("includes personal bullets and community line", () => {
    const mail = buildWeeklyDigestEmail({
      recipientUserId: "11111111-1111-1111-1111-111111111111",
      displayName: "Sheen404",
      period: {
        startDate: "2026-09-30",
        endDate: "2026-10-06",
        label: "30 Sep – 6 Oct",
      },
      stats: {
        newCredits: 3,
        totalRides: 12,
        parksVisited: 2,
        friendsActive: 1,
        communityRiders: 18,
      },
    });
    expect(mail.subject).toContain("3 new credits");
    expect(mail.text).toContain("3 new coaster credits");
    expect(mail.text).toContain("12 total rides logged");
    expect(mail.text).toContain("18 riders logged credits");
    expect(mail.html).toContain("Your week on CoasterTrak");
    expect(mail.html).toContain("Sheen404");
  });
});
