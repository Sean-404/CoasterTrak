import { describe, expect, it } from "vitest";
import {
  buildWeeklyDigestEmail,
  shouldSendWeeklyDigest,
  weeklyDigestPeriod,
} from "@/lib/weekly-digest";

describe("weeklyDigestPeriod", () => {
  it("returns a 7-day inclusive UTC window", () => {
    const period = weeklyDigestPeriod(new Date("2026-10-06T18:00:00Z"));
    expect(period.endDate).toBe("2026-10-06");
    expect(period.startDate).toBe("2026-09-30");
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
