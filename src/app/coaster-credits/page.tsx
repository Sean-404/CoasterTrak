import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: {
    absolute: "Free Coaster Credit Tracker | CoasterTrak",
  },
  description:
    "Free coaster credit tracker for unique rides. Log each credit once, keep repeats as extra rides, see park leftovers, and compare tallies with friends — no app store required.",
  keywords: [
    "coaster credit tracker",
    "free coaster credit tracker",
    "coaster credit",
    "coaster credits",
    "coaster credit app",
    "coaster credit logger",
    "roller coaster credits",
    "roller coaster credit tracker",
    "unique coaster credits",
    "coaster log",
    "coaster logger",
    "coaster tally",
    "theme park credit tracker",
    "credit hunter",
    "credit logger",
    "CoasterTrak",
  ],
  alternates: {
    canonical: "/coaster-credits",
  },
  openGraph: {
    title: "Free Coaster Credit Tracker | CoasterTrak",
    description:
      "Free coaster credit tracker to log unique rides, plan leftover credits at a park, and compare tallies with friends.",
    url: `${SITE_URL}/coaster-credits`,
    type: "website",
  },
};

const faqs = [
  {
    question: "What is a coaster credit?",
    answer:
      "A coaster credit is a distinct roller coaster you have ridden at least once. Riding Steel Vengeance five times is still one credit and five rides. Enthusiasts track both numbers.",
  },
  {
    question: "Is CoasterTrak a coaster credit app?",
    answer:
      "Yes. CoasterTrak is a free web app for logging coaster credits on your phone or computer. You do not need a separate install: open coastertrak.com, create an account, and your tally syncs across devices.",
  },
  {
    question: "What's the difference between unique credits and total rides?",
    answer:
      "Unique credits are distinct coasters you have ridden at least once. Total rides includes repeats. CoasterTrak tracks both so you can say 400 credits and 18 rides today.",
  },
  {
    question: "Can I keep a roller coaster log with dates?",
    answer:
      "Yes. Each credit can have ride days and quantities. That turns a checkbox list into a coaster log with first ridden and last ridden, while undated older credits still count.",
  },
  {
    question: "Does it count family and kiddie coasters?",
    answer:
      "You can log every catalog coaster. Stats default to a thrill-ride view and hide family-style credits until you turn that filter on. Achievements still count every logged credit.",
  },
  {
    question: "Can I compare coaster credits with friends?",
    answer:
      "Yes. After you add a friend, Compare shows rides you both have, credits only they have, and park-by-park leftovers — useful before a shared trip.",
  },
  {
    question: "Is the coaster credit tracker free?",
    answer:
      "Yes. Logging credits, the map, wishlists, stats, and friend compare are free with a standard account.",
  },
] as const;

export default function CoasterCreditsLandingPage() {
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
        name: "Coaster credit tracker",
        item: `${SITE_URL}/coaster-credits`,
      },
    ],
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to log coaster credits in CoasterTrak",
    description: "Start a free coaster credit tally in three steps.",
    step: [
      {
        "@type": "HowToStep",
        name: "Find the coaster",
        text: "Open Discover and search the map, parks list, or coasters list for the ride you did.",
        url: `${SITE_URL}/map`,
      },
      {
        "@type": "HowToStep",
        name: "Mark it ridden",
        text: "Create a free account, then log the credit. Add a date if you remember the day; repeats increase the ride count, not the unique credit.",
        url: `${SITE_URL}/login`,
      },
      {
        "@type": "HowToStep",
        name: "Check your tally",
        text: "Open Stats for unique credits and total rides. Compare with a friend to see credits only they have.",
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Coaster credit tracker</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight sm:text-5xl">
          Free coaster credit tracker
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300">
          CoasterTrak is a free coaster credit tracker for people who count unique rides — or who just searched for a
          place to start. Log each credit once, keep repeats as extra rides, and use park pages plus friend compare to
          see what is still left before the next trip. Works in your browser on phone or desktop.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
          >
            Start free credit log
          </Link>
          <Link
            href="/map"
            className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/35"
          >
            Browse parks &amp; coasters
          </Link>
          <Link
            href="/coaster-tracker"
            className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/35"
          >
            Full coaster tracker guide
          </Link>
        </div>

        <section className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ValueCard
            title="Unique credits"
            description="One catalog coaster equals one credit, even if you re-ride it all day."
          />
          <ValueCard
            title="Ride counts"
            description="Log dates and extras so Stats can show both your credit tally and ×N repeats."
          />
          <ValueCard
            title="Park leftovers"
            description="Compare with a friend to see credits only they have at a park you are visiting together."
          />
          <ValueCard
            title="Works on your phone"
            description="No store listing required. The web app is the coaster credit tracker — bookmark it and go."
          />
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">What a coaster credit actually is</h2>
          <p>
            Among enthusiasts, a coaster credit is not a FastPass, a photo pass, or a ticket. It is a unique roller
            coaster you have sat down on. Parks visited, hours in line, and how many laps you did on the same layout
            are separate bragging rights.
          </p>
          <p>
            People argue about the edges — family coasters, powered rides, indoor spinning mice — which is why
            CoasterTrak lets you log everything, then filter Stats to thrill rides. Your full tally is still there
            for achievements and for friends who count every mouse.
          </p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">How this coaster credit tracker counts</h2>
          <p>
            Mark a catalog coaster ridden and it becomes one credit. Ride it again and the unique count stays the
            same; the ride count goes up. That matches how most credit hunters talk: &quot;I have 400 credits, and
            I did 18 rides today.&quot;
          </p>
          <p>
            Optional dates turn that into a history, not just a checkbox. First-ridden and last-ridden matter when
            you go back to a park years later. Older undated credits still count toward the total.
          </p>
          <p>
            CoasterTrak is not an encyclopedia of every layout ever built. Use it to keep <em>your</em> list, plan
            leftover credits at a park, and compare overlap with people you actually ride with. For a fuller tour of
            the map, wishlist, and stats screens, see the{" "}
            <Link href="/coaster-tracker" className="font-semibold text-amber-400 hover:text-amber-300">
              roller coaster tracker guide
            </Link>
            .
          </p>
        </section>

        <section className="mt-12 max-w-3xl space-y-4 text-base leading-relaxed text-slate-300">
          <h2 className="text-2xl font-semibold text-white">Why searchers look for a coaster credit app</h2>
          <p>
            Spreadsheets work until you forget which Corkscrew was which park. A dedicated coaster credit app keeps
            the catalog, your tally, and trip leftovers in one place — same job as a coaster log or theme park
            credit tracker. CoasterTrak runs in the browser on iPhone, Android, and desktop, so you can
            log a credit in the queue without waiting on an app-store review.
          </p>
          <p>
            After you add friends, Compare is built for the question credit hunters actually ask: not &quot;who has
            a bigger number,&quot; but &quot;which of these have I still not done?&quot; Filter to a park, open the
            only-them list, and you have a ride order for the day.
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-2xl font-semibold text-white">Start your coaster credit log</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
            <li>- Browse the map or catalog without an account.</li>
            <li>- Sign in to save credits, dates, wishlists, and photos.</li>
            <li>- Compare leftover credits with a friend before you travel.</li>
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
              Create free account
            </Link>
            <Link
              href="/coaster-tracker"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/35"
            >
              Full tracker guide
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Questions about a wrong catalog row? Email {CONTACT_EMAIL} with the park, ride, and what should change.
          </p>
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
