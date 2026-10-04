import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_PREFS, prefsFromProfileRow } from "@/lib/notification-prefs";

describe("prefsFromProfileRow", () => {
  it("defaults to enabled when row is missing", () => {
    expect(prefsFromProfileRow(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("treats null columns as enabled", () => {
    expect(
      prefsFromProfileRow({
        notify_friend_requests: null,
        notify_friend_accepted: null,
      }),
    ).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("respects explicit opt-outs", () => {
    expect(
      prefsFromProfileRow({
        notify_friend_requests: false,
        notify_friend_accepted: true,
      }),
    ).toEqual({
      notifyFriendRequests: false,
      notifyFriendAccepted: true,
    });
  });
});
