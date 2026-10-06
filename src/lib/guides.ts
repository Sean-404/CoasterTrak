export type GuideMeta = {
  slug: string;
  title: string;
  description: string;
  /** Short card blurb for the hub. */
  summary: string;
  /** ISO date YYYY-MM-DD */
  published: string;
  /** Minutes, approximate. */
  readingMinutes: number;
  keywords: string[];
};

/**
 * Original long-form guides for SEO / AdSense substance.
 * Keep in sync with pages under /guides/[slug].
 */
export const GUIDES: GuideMeta[] = [
  {
    slug: "what-is-a-coaster-credit",
    title: "What is a coaster credit?",
    description:
      "A plain-English guide to coaster credits: unique rides versus repeats, edge cases enthusiasts argue about, and how to start a tally without a spreadsheet.",
    summary: "Unique rides, not FastPasses — how credit hunters count and why it matters.",
    published: "2026-10-06",
    readingMinutes: 8,
    keywords: [
      "coaster credit",
      "what is a coaster credit",
      "roller coaster credits",
      "unique coaster credits",
    ],
  },
  {
    slug: "first-park-day-credit-log",
    title: "How to start a coaster credit log on your first park day",
    description:
      "A practical park-day workflow: what to log in line, what to finish at home, and how to avoid losing credits when the day gets chaotic.",
    summary: "A simple first-day system so you do not lose credits between queues.",
    published: "2026-10-06",
    readingMinutes: 9,
    keywords: ["coaster credit log", "park day", "roller coaster tracker", "start credit count"],
  },
  {
    slug: "unique-credits-vs-total-rides",
    title: "Unique credits vs total rides",
    description:
      "Why enthusiasts track two numbers, how re-rides work, and how to talk about both without mixing them up.",
    summary: "Two tallies, one day: credits stay put while ride counts climb.",
    published: "2026-10-06",
    readingMinutes: 7,
    keywords: ["unique credits", "total rides", "coaster tally", "re-rides"],
  },
  {
    slug: "planning-park-leftovers",
    title: "How to plan leftover credits at a park",
    description:
      "Turn a park lineup into a ride order: log what you already have, find leftovers, and use friend compare before a shared trip.",
    summary: "Park leftovers and friend compare before you buy tickets.",
    published: "2026-10-06",
    readingMinutes: 8,
    keywords: ["park leftovers", "coaster wishlist", "theme park planning", "friend compare"],
  },
  {
    slug: "first-year-credit-hunting",
    title: "First-year credit hunting: parks that build a tally fast",
    description:
      "A first-year strategy for credit hunters — how to pick parks, what “fast tally” really means, and how to keep the hobby fun instead of checklist-only.",
    summary: "Build a meaningful tally in year one without burning out.",
    published: "2026-10-06",
    readingMinutes: 10,
    keywords: ["credit hunting", "first year coaster credits", "theme park trip planning"],
  },
  {
    slug: "coasterguessr-photo-game",
    title: "CoasterGuessr: guess the coaster from a photo",
    description:
      "How CoasterGuessr works, tips for reading ride photos, and how the game connects to logging real credits on CoasterTrak.",
    summary: "Train your eye on park photos, then log the real credit later.",
    published: "2026-10-06",
    readingMinutes: 6,
    keywords: ["CoasterGuessr", "guess the coaster", "coaster photo game"],
  },
];

export function getGuide(slug: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function guidePath(slug: string): string {
  return `/guides/${slug}`;
}
