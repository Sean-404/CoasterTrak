import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AuthErrorHandler } from "@/components/auth-error-handler";
import { HomeHeroCtas } from "@/components/home-hero-ctas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { listFeaturedParks } from "@/lib/catalog-server";
import { CONTACT_EMAIL, INSTAGRAM_URL, SITE_URL } from "@/lib/site-url";
import { parkSlug } from "@/lib/slug";

export const metadata: Metadata = {
  title: {
    absolute: "CoasterTrak | Free Roller Coaster Tracker",
  },
  description:
    "CoasterTrak (coaster trak) is a free roller coaster tracker. Log ride credits, explore parks on a world map, browse the catalog, build a wishlist, and compare stats with friends.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "CoasterTrak | Free Roller Coaster Tracker",
    description:
      "Free roller coaster tracker to log credits, explore parks on a map, and compare stats with friends.",
    url: "/",
    type: "website",
  },
};

export default async function Home() {
  const featuredParks = await listFeaturedParks(6);

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CoasterTrak",
    alternateName: ["Coaster Trak", "coaster trak", "Coaster Tracker"],
    url: SITE_URL,
    description:
      "Free roller coaster tracker to log ride credits, explore parks on a map, build a wishlist, and compare stats.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/coasters?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CoasterTrak",
    alternateName: ["Coaster Trak", "coaster trak"],
    url: SITE_URL,
    logo: `${SITE_URL}/coastertrak-logo.png`,
    email: CONTACT_EMAIL,
    sameAs: [INSTAGRAM_URL],
    contactPoint: {
      "@type": "ContactPoint",
      email: CONTACT_EMAIL,
      contactType: "customer support",
      url: `${SITE_URL}/contact`,
    },
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CoasterTrak",
    alternateName: ["Coaster Trak", "coaster trak", "Coaster Tracker"],
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description:
      "Free web app to track roller coaster credits, explore theme parks on a world map, manage a wishlist, and compare stats with friends.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <div className="flex min-h-screen flex-col">
      <AuthErrorHandler />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <SiteHeader />

      <section className="relative overflow-hidden bg-slate-950 pb-20 pt-16 text-white sm:pb-24 sm:pt-20">
        <Image
          src="/coaster-hero.png"
          alt="Roller coaster track against the sky — CoasterTrak roller coaster tracker"
          fill
          unoptimized
          className="object-cover object-center opacity-80"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/40 to-slate-950/10" />
        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <p className="font-bungee text-2xl tracking-wide text-amber-400 sm:text-3xl">CoasterTrak</p>
          <h1 className="font-bungee mt-3 text-4xl leading-tight text-white sm:text-6xl lg:text-7xl">
            Free Roller
            <br />
            <span className="break-words text-amber-400">Coaster Tracker</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-300">
            Log every credit, discover parks and coasters on the map, browse the catalog, and watch your
            coaster stats grow.
          </p>
          <HomeHeroCtas />
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-14">
        <div className="grid gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={<MapIcon />}
            title="World Map"
            description="Find coasters at parks across every continent, then switch to park or ride lists."
            href="/map"
          />
          <FeatureCard
            icon={<ParksIcon />}
            title="Parks"
            description="Browse theme parks by country, open park pages, and jump into each ride list."
            href="/parks"
          />
          <FeatureCard
            icon={<GuideIcon />}
            title="Coaster guide"
            description="Learn how credits, wishlists, and stats work before you start logging rides."
            href="/coaster-tracker"
          />
        </div>

        {featuredParks.length > 0 ? (
          <section className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Featured parks</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                  Popular parks with big ride catalogs — Disney, Universal, Six Flags, Alton Towers, and more.
                </p>
              </div>
              <Link
                href="/parks"
                className="text-sm font-semibold text-amber-700 underline-offset-2 hover:underline"
              >
                Browse all parks →
              </Link>
            </div>
            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {featuredParks.map((park) => (
                <li key={park.id}>
                  <Link
                    href={`/parks/${parkSlug(park.name, park.id)}`}
                    className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-amber-300 hover:shadow-md sm:py-4"
                  >
                    <p className="font-semibold text-slate-900">{park.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{park.country}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-slate-500">
              Looking for a specific ride?{" "}
              <Link href="/coasters" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
                Browse coasters
              </Link>
              .
            </p>
          </section>
        ) : null}

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">A roller coaster tracker built for real trips</h2>
          <div className="mt-4 max-w-3xl space-y-4 text-base leading-relaxed text-slate-600">
            <p>
              CoasterTrak is a free coaster tracker that helps enthusiasts keep a durable record of every credit —
              from local park day trips to multi-park holidays abroad. Instead of juggling notes and photos, you log
              rides in one place, then revisit totals, park coverage, and milestones whenever you want.
            </p>
            <p>
              Start on the map or park catalog to browse coasters, star the rides you still need, and create a free
              account when you are ready to save progress across devices. Friends features let you compare credits
              and share achievements with the people you ride with.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-slate-900">How it works</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Step 1</p>
              <h3 className="mt-2 font-semibold text-slate-900">Explore parks and coasters</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Search the map or browse catalog pages, filter what matters for your trip, and open ride details
                before you go.
              </p>
            </li>
            <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Step 2</p>
              <h3 className="mt-2 font-semibold text-slate-900">Log and wishlist</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Mark coasters you have ridden and save the ones still on your bucket list so the next itinerary is
                easier to plan.
              </p>
            </li>
            <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Step 3</p>
              <h3 className="mt-2 font-semibold text-slate-900">Watch stats grow</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Check your ride count, rate the rides you&apos;ve done, unlock achievements, and compare with friends.
              </p>
            </li>
          </ol>
        </section>

        <p className="mt-10 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Data quality note: Coaster and park data is sourced from third-party datasets and community-maintained
          sources. Some entries may be incomplete, outdated, or occasionally inaccurate. Always confirm details with
          the park before you travel.
        </p>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Build your coaster journey, then share it</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Create an account to keep ride history, wishlists, and friend comparisons in sync. New to coaster
            tracking? Read the guide for a fuller walkthrough of credits, map browsing, and stats.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/coaster-tracker"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Explore the coaster tracker guide
            </Link>
            <Link
              href="/parks"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              Browse parks
            </Link>
            <Link
              href="/coasters"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              Browse coasters
            </Link>
            <Link
              href="/about"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              About CoasterTrak
            </Link>
            <Link
              href="/contact"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              Contact
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-amber-300 hover:shadow-md"
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-500 transition group-hover:bg-amber-100">
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
    </Link>
  );
}

function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function ParksIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function GuideIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
