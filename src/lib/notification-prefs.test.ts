import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_PREFS, prefsFromProfileRow } from "@/lib/notification-prefs";

describe("prefsFromProfileRow", () => {
  it("defaults friend emails on and digest off when row is missing", () => {
    expect(prefsFromProfileRow(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(DEFAULT_NOTIFICATION_PREFS.notifyWeeklyDigest).toBe(false);
  });

  it("treats null friend columns as enabled and digest as off", () => {
    expect(
      prefsFromProfileRow({
        notify_friend_requests: null,
        notify_friend_accepted: null,
        notify_weekly_digest: null,
      }),
    ).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("respects explicit opt-outs and digest opt-in", () => {
    expect(
      prefsFromProfileRow({
        notify_friend_requests: false,
        notify_friend_accepted: true,
        notify_weekly_digest: true,
      }),
    ).toEqual({
      notifyFriendRequests: false,
      notifyFriendAccepted: true,
      notifyWeeklyDigest: true,
    });
  });
});
