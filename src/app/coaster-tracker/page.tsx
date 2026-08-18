import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CONTACT_EMAIL, INSTAGRAM_URL, SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Roller Coaster Tracker (Coaster Trak)",
  description:
    "CoasterTrak is a free roller coaster tracker — also known as coaster trak — to log ride credits, discover parks on the map, build a wishlist, and compare coaster stats with friends.",
  keywords: [
    "roller coaster tracker",
    "coaster tracker",
    "coaster trak",
    "CoasterTrak",
    "coaster credits",
    "theme park tracker",
    "roller coaster credit log",
  ],
  alternates: {
    canonical: "/coaster-tracker",
  },
  openGraph: {
    title: "Roller Coaster Tracker | CoasterTrak",
    description:
      "Track roller coaster credits, discover parks worldwide, and compare coaster stats with friends on CoasterTrak.",
    url: `${SITE_URL}/coaster-tracker`,
    type: "website",
  },
};

const faqs = [
  {
    question: "Is CoasterTrak free?",
    answer:
      "Yes. Core tracking, map browsing, wishlists, and stats are free to use with a standard account.",
  },
  {
    question: "Do I need an account to browse?",
    answer:
      "No. Anyone can use Discover to explore the map and catalog. An account is required to save ride history, wishlists, and friend connections.",
  },
  {
    question: "What is the difference between CoasterTrak and coaster trak?",
    answer:
      "They are the same product. CoasterTrak is the brand name; people often search for coaster trak or coaster tracker when looking for a free roller coaster credit log.",
  },
  {
    question: "Where does the park data come from?",
    answer:
      "From third-party and community-maintained datasets. We aim for useful coverage, but entries can be wrong or outdated — verify important details with the park.",
  },
  {
    question: "How do I report a missing or wrong ride?",
    answer:
      `Email ${CONTACT_EMAIL} with the park, ride name, page URL, and what should change. We cannot promise an instant catalog edit.`,
  },
] as const;

export default function CoasterTrackerLandingPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Roller coaster tracker",
        item: `${SITE_URL}/coaster-tracker`,
      },
    ],
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to track roller coasters with CoasterTrak",
    description:
      "Start using CoasterTrak as your free roller coaster tracker in three steps.",
    step: [
      {
        "@type": "HowToStep",
        name: "Explore parks and coasters",
        text: "Open Discover in the header — the world map by default — or switch to the parks and coasters lists to find rides.",
        url: `${SITE_URL}/map`,
      },
      {
        "@type": "HowToStep",
        name: "Create a free account",
        text: "Sign up so you can save ride history, wishlists, and friend comparisons.",
        url: `${SITE_URL}/login`,
      },
      {
        "@type": "HowToStep",
        name: "Log credits and watch stats grow",
        text: "Mark coasters ridden, star wishlist rides, and review your totals anytime.",
        url: `${SITE_URL}/stats`,
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">CoasterTrak Guide</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight sm:text-5xl">
          Free roller coaster tracker
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300">
          CoasterTrak is a free roller coaster tracker for enthusiasts who want to log rides, discover new parks, and
          watch their coaster credits grow over time. If you searched for coaster trak or coaster tracker, you are in
          the right place — this guide explains how the main tools fit together so you can get useful value on day one.
        </p>

        <section className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ValueCard
            title="Track every ride"
            description="Keep a clean record of every roller coaster you have ridden and revisit your totals anytime."
          />
          <ValueCard
            title="Discover parks"
            description="Start on the world map, then switch to park or coaster lists from the same Discover tab."
          />
          <ValueCard
            title="Build your wishlist"
            description="Save dream coasters, then check them off as you travel."
          />
          <ValueCard
            title="Compare with friends"
            description="See how your coaster stats stack up and share progress with your coaster crew."
          />
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">What is a coaster credit?</h2>
          <p>
            In enthusiast slang, a &quot;credit&quot; usually means a distinct roller coaster you have ridden at least
            once. People count credits differently — some include family coasters, others only full-circuit thrill
            rides — but the idea is the same: a lasting tally of rides experienced, not just parks visited.
          </p>
          <p>
            CoasterTrak is built around that habit. Log the rides you have done, keep a wishlist for the ones still
            ahead, and use stats and achievements to see progress without maintaining a separate spreadsheet.
          </p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">Discover: map, parks, and coasters</h2>
          <p>
            <Link href="/map" className="font-semibold text-amber-400 hover:text-amber-300">
              Discover
            </Link>{" "}
            in the header opens the{" "}
            <Link href="/map" className="font-semibold text-amber-400 hover:text-amber-300">
              world map
            </Link>
            . Use the tabs on that page to switch to the{" "}
            <Link href="/parks" className="font-semibold text-amber-400 hover:text-amber-300">
              parks
            </Link>{" "}
            or{" "}
            <Link href="/coasters" className="font-semibold text-amber-400 hover:text-amber-300">
              coasters
            </Link>{" "}
            lists. All three views share the same catalog: a park page lists that park&apos;s rides, a ride page links
            back to its park, and the map is the geographic index.
          </p>
          <p>
            Zoom into a region, search by name, and open ride details when you are planning a trip. You can browse
            without an account; signing in unlocks saving rides and wishlists so your plans persist across sessions.
            Search and country filters on the lists are for planning, not for padding a credit count.
          </p>
          <p>
            Catalog data is compiled from third-party and community sources. Treat it as a planning aid: park lineups
            change, temporary closures happen, and a few records may be incomplete. Confirm operating status and
            restrictions with the park before you travel.
          </p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">Wishlists, stats, and friends</h2>
          <p>
            After you create an account, add coasters to your wishlist while browsing, then mark them ridden when you
            get the credit. The stats view summarises how many rides you have logged and related totals. Friends
            features are for comparing progress with people you actually ride with — not a public social network.
          </p>
          <p>
            On{" "}
            <Link href="/friends" className="font-semibold text-amber-400 hover:text-amber-300">
              Friends
            </Link>
            , search by display name to send requests, or choose{" "}
            <strong className="font-semibold text-white">Browse public profiles</strong> to see riders who set their
            stats to public. That directory is only for signed-in users and is not indexed by search engines.
          </p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">Achievements</h2>
          <p>
            The{" "}
            <Link href="/achievements" className="font-semibold text-amber-400 hover:text-amber-300">
              Achievements
            </Link>{" "}
            page turns your logged credits into milestones — ride counts, park coverage, height totals, and similar
            goals. Progress uses your full ride history, including family coasters, even when your stats list is
            filtered to thrill rides only. Achievements are self-reported for fun; there is no verification step.
          </p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">How CoasterTrak counts credits</h2>
          <p>
            A credit here is a distinct catalog coaster you have marked ridden at least once. If you ride Nemesis
            three times in a day, that is still one credit and three rides. Stats show both: unique coasters, and a
            ×N count when you have logged repeats.
          </p>
          <p>
            You can attach calendar dates to those logs. That is useful when you go back to a park years later and
            want first-ridden and last-ridden dates, not just a yes/no checkbox. Undated credits from older saves
            still count; they just will not appear on a specific day.
          </p>
          <p>
            Stats default to a thrill-ride focus and hide family coasters until you turn that filter on. Achievements
            still count every logged credit, including family rides, so unlocking a milestone and filtering the list
            can show different totals. That is intentional: many enthusiasts keep two numbers.
          </p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">Privacy, photos, and friends</h2>
          <p>
            New accounts keep stats friends-only. You can switch to private (only you) or public to signed-in
            CoasterTrak users. Public profiles appear under Friends → Browse public profiles; that list is not
            offered to search engines. Friends comparisons hide another rider&apos;s numbers when they have chosen
            private.
          </p>
          <p>
            You can attach one ride photo per coaster. Location metadata is stripped before upload. People who are
            allowed to view your stats can see that photo; nobody else can. Profile photos work like your display
            name: signed-in users may see them in Friends.
          </p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">Why use a dedicated coaster tracker?</h2>
          <p>
            Spreadsheets and notes apps work until the catalog grows. A dedicated roller coaster tracker like
            CoasterTrak keeps park pages, ride stats, wishlists, and friend comparisons in one place — so planning a
            trip and updating your credit count stay connected.
          </p>
          <p>
            Browse Discover anytime, then jump back to the map when you are ready to explore a region. Trip photos
            and occasional updates are on{" "}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-400 hover:text-amber-300"
            >
              Instagram
            </a>
            .
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-2xl font-semibold text-white">Why riders use CoasterTrak</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
            <li>- One place for coaster credits, wishlists, and park discovery.</li>
            <li>- Fast map browsing for parks across regions.</li>
            <li>- Stats and achievements that make progress visible.</li>
            <li>- Friends features for comparisons and shared milestones.</li>
            <li>- Built for coaster fans with a clean, focused interface.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/map"
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
            >
              Open Discover
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/35"
            >
              Create account
            </Link>
            <Link
              href="/about"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/35"
            >
              About the project
            </Link>
            <Link
              href="/contact"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/35"
            >
              Contact
            </Link>
          </div>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">Frequently asked questions</h2>
          {faqs.map((faq) => (
            <div key={faq.question}>
              <h3 className="font-semibold text-white">{faq.question}</h3>
              <p className="mt-1">{faq.answer}</p>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter variant="dark" />
    </div>
  );
}

function ValueCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
    </article>
  );
}
