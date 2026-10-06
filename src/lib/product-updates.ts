export type ProductUpdate = {
  /** Stable id; newer entries must be lexicographically greater (array is newest-first). */
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  title: string;
  summary: string;
  highlights?: string[];
};

/**
 * Newest first. Prepend a new entry when you ship something worth announcing.
 * The header badge uses the first entry’s id as “latest”.
 */
export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: "2026-10-06d-weekly-digest",
    date: "2026-10-06",
    title: "Weekly credit digest",
    summary:
      "A Sunday email with your new credits, rides, and a light community note — only when you (or a friend) logged something that week. On by default; turn off at signup or in Account.",
    highlights: [
      "Signup checkbox to keep or skip the weekly digest",
      "Account → Email notifications → Weekly credit digest",
      "Unsubscribe link in every digest · empty weeks are skipped",
    ],
  },
  {
    id: "2026-10-06c-home-screen",
    date: "2026-10-06",
    title: "Add CoasterTrak to your home screen",
    summary:
      "Install tips on Stats and Account so park-day logging is one tap away — works like an app without the app store.",
    highlights: [
      "iPhone: Safari Share → Add to Home Screen",
      "Android: Install app when your browser offers it",
      "Dismiss anytime; tip stays hidden after that",
    ],
  },
  {
    id: "2026-10-06b-public-profiles-invites",
    date: "2026-10-06",
    title: "Public profiles & invite links",
    summary:
      "Share a public /u/yourname profile, copy an invite link for friends, and point stats cards at a real destination — plus new coaster credit guides.",
    highlights: [
      "Public profiles at /u/displayname when stats visibility is Public",
      "Invite links from Stats and Friends that send a friend request after signup",
      "Share cards and Wrapped include your profile or invite URL",
      "Guides hub at /guides with six original articles",
    ],
  },
  {
    id: "2026-10-06a-guides",
    date: "2026-10-06",
    title: "New coaster credit guides",
    summary:
      "Original long-form guides on credits, park-day logging, leftovers, first-year hunting, and CoasterGuessr.",
    highlights: [
      "Hub at /guides with six new articles",
      "Linked from the footer and sitemap for discovery",
      "Written as CoasterTrak originals, not Wikipedia republishing",
    ],
  },
  {
    id: "2026-10-05-friend-emails",
    date: "2026-10-05",
    title: "Friend request emails",
    summary:
      "Get an email when someone sends or accepts a friend request. Notifications are on by default, with toggles in Account and an unsubscribe link in every message.",
    highlights: [
      "Emails for new friend requests and accepted requests",
      "Turn them off anytime under Account → Email notifications",
      "Signup includes an opt-out checkbox",
    ],
  },
  {
    id: "2026-09-17-catalog-installs",
    date: "2026-09-17",
    title: "Clone rides stay at the park you visited",
    summary:
      "Same-named coasters at different parks now keep separate catalog rows, so a closed Ride of Steel does not hide the operating one at Darien Lake.",
    highlights: [
      "Ride of Steel, Superman: Ultimate Flight, Mr. Freeze, Hurler, and Flight of the Hippogriff clones restored where they were missing",
      "Park and coaster pages lead with CoasterTrak lineup facts instead of Wikipedia copy",
      "New catalog guide explains sourcing, clone installs, and how to report a missing ride",
    ],
  },
  {
    id: "2026-09-08-coasterguessr",
    date: "2026-09-08",
    title: "CoasterGuessr",
    summary:
      "Pin the park from a coaster photo. Open CoasterGuessr in the menu, drop a pin, and lock it in. Show answer reveals the ride without a score.",
    highlights: [
      "Only catalog rides that already have a useful photo are in the pool",
      "Western Japan parks are no longer labeled South Korea",
    ],
  },
  {
    id: "2026-09-04b-profiles-compare-mobile",
    date: "2026-09-04",
    title: "Richer public profiles and cleaner compare on phone",
    summary:
      "Browse public profiles with credits and favorites at a glance, and compare friends without cramped park filters on small screens.",
    highlights: [
      "Public profiles show country, credit count, fav ride, and fav park before you open Stats",
      "Friend compare park filter and park list are tighter on iPhone-sized screens",
    ],
  },
  {
    id: "2026-09-04-wrapped-all-time",
    date: "2026-09-04",
    title: "Wrapped covers every credit",
    summary:
      "All-time Wrapped uses your unique credits — no ride date required. Month and year Wrapped still need dated logs for an honest trip timeline.",
    highlights: [
      "Open Stats → Wrapped and pick All-time for the full recap",
      "Quiet month/year empty states point you to All-time instead of asking you to re-date everything",
    ],
  },
  {
    id: "2026-09-04-map-and-catalog",
    date: "2026-09-04",
    title: "Map memory and catalog polish",
    summary:
      "The Discover map restores your last camera position when you come back, and several catalog labels and park names are cleaner.",
    highlights: [
      "Map center and zoom persist across Back / Discover",
      "Disney’s Magic Kingdom naming and manufacturer pills cleaned up",
    ],
  },
];

export function latestProductUpdate(): ProductUpdate | null {
  return PRODUCT_UPDATES[0] ?? null;
}

/** True when `lastSeenId` is missing or older than the newest published update. */
export function hasUnseenProductUpdates(lastSeenId: string | null | undefined): boolean {
  const latest = latestProductUpdate();
  if (!latest) return false;
  if (!lastSeenId) return true;
  return lastSeenId !== latest.id;
}

export function formatProductUpdateDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
