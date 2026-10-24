export type GuideMeta = {
  slug: string;
  title: string;
  description: string;
  /** Short card blurb for the hub. */
  summary: string;
  /** ISO date YYYY-MM-DD */
  published: string;
  /** ISO date YYYY-MM-DD of the last real content change; defaults to `published`. */
  updated?: string;
  /** Minutes, approximate. */
  readingMinutes: number;
  keywords: string[];
  /**
   * Key into GUIDE_AUTHORS for first-hand guides written by a named person.
   * Leave unset for house guides, which are credited to CoasterTrak.
   */
  author?: string;
};

export type GuideAuthor = {
  name: string;
  /** One or two sentences: who they are and why they are worth reading on this topic. */
  bio: string;
  /** Optional public profile (e.g. /u/name or Instagram). */
  url?: string;
};

/** Named authors. Only list real people, and only on guides they actually wrote. */
export const GUIDE_AUTHORS: Record<string, GuideAuthor> = {
  // The site's founder writes under the brand rather than a personal name.
  founder: {
    name: "CoasterTrak's founder",
    bio: "I built CoasterTrak to keep track of my own coaster credits. I'm based in the UK, and trip reports marked with this byline come from my own park days.",
    url: "/u/CoasterTrak",
  },
};

export function guideAuthor(guide: Pick<GuideMeta, "author">): GuideAuthor | null {
  return guide.author ? (GUIDE_AUTHORS[guide.author] ?? null) : null;
}

export function guideUpdated(guide: Pick<GuideMeta, "published" | "updated">): string {
  return guide.updated ?? guide.published;
}

/**
 * Original long-form guides for credit hunters.
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

/** Most recently updated first; named-author guides win ties so first-hand pieces lead. */
export function latestGuides(limit: number, guides: GuideMeta[] = GUIDES): GuideMeta[] {
  return [...guides]
    .sort((a, b) => {
      const byDate = guideUpdated(b).localeCompare(guideUpdated(a));
      if (byDate !== 0) return byDate;
      return Number(Boolean(b.author)) - Number(Boolean(a.author));
    })
    .slice(0, limit);
}
