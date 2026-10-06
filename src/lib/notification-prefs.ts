export type NotificationPrefs = {
  notifyFriendRequests: boolean;
  notifyFriendAccepted: boolean;
  notifyWeeklyDigest: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notifyFriendRequests: true,
  notifyFriendAccepted: true,
  notifyWeeklyDigest: true,
};

export function prefsFromProfileRow(row: {
  notify_friend_requests?: boolean | null;
  notify_friend_accepted?: boolean | null;
  notify_weekly_digest?: boolean | null;
} | null | undefined): NotificationPrefs {
  return {
    notifyFriendRequests: row?.notify_friend_requests !== false,
    notifyFriendAccepted: row?.notify_friend_accepted !== false,
    notifyWeeklyDigest: row?.notify_weekly_digest !== false,
  };
}
