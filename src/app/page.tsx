import Image from "next/image";
import Link from "next/link";
import { AuthErrorHandler } from "@/components/auth-error-handler";
import { HomeHeroCtas } from "@/components/home-hero-ctas";
import { SiteHeader } from "@/components/site-header";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com";

export default function Home() {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CoasterTrak",
    url: SITE_URL,
    description:
      "Track every roller coaster you ride. Explore parks on a map, build your wishlist, and compare stats.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/map?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CoasterTrak",
    url: SITE_URL,
    logo: `${SITE_URL}/coastertrak-logo.png`,
  };

  return (
    <div className="min-h-screen">
      <AuthErrorHandler />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950 pb-20 pt-16 text-white sm:pb-24 sm:pt-20">
        {/* Background image */}
        <Image
          src="/coaster-hero.png"
          alt=""
          fill
          unoptimized
          className="object-cover object-center opacity-80"
          priority
        />
        {/* Left-side overlay keeps text readable, right side lets the image breathe */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/40 to-slate-950/10" />
        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <div className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-400">
            Your ride tracker
          </div>
          <h1 className="font-bungee mt-4 text-4xl leading-tight text-white sm:text-6xl lg:text-7xl">
            Track Every<br />
            <span className="break-words text-amber-400">Roller Coaster</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-300">
            Explore parks worldwide on an interactive map, build your bucket list, and track your coaster stats.
          </p>
          <HomeHeroCtas />
        </div>
      </section>

      {/* Feature cards */}
      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={<MapIcon />}
            title="World Map"
            description="Find coasters at parks across every continent on an interactive map."
            href="/map"
          />
          <FeatureCard
            icon={<WishlistIcon />}
            title="Wishlist"
            description="Save the rides you want to do and check them off one by one as you conquer them."
            href="/wishlist"
          />
          <FeatureCard
            icon={<StatsIcon />}
            title="Stats"
            description="See how many coasters you've ridden, track your history, and measure your progress."
            href="/stats"
          />
        </div>
        <p className="mt-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Data quality note: Coaster and park data is sourced from third-party datasets and community-maintained
          sources. Some entries may be incomplete, outdated, or occasionally inaccurate.
        </p>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Build your coaster journey, then share it</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
            CoasterTrak helps riders track roller coaster credits, compare stats, and discover parks worldwide.
            Create an account to save your progress, keep your wishlist in one place, and revisit your profile after
            every trip.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/coaster-tracker"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Explore the coaster tracker guide
            </Link>
          </div>
        </section>
      </main>
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

function WishlistIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
