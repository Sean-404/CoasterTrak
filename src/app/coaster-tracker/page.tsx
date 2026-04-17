import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com";

export const metadata: Metadata = {
  title: "Roller Coaster Tracker",
  description:
    "Use CoasterTrak as your roller coaster tracker to log rides, build a wishlist, explore parks on a world map, and compare coaster stats with friends.",
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

export default function CoasterTrackerLandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">CoasterTrak Guide</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight sm:text-5xl">Your roller coaster tracker</h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300">
          CoasterTrak is a free roller coaster tracker for enthusiasts who want to log rides, discover new parks, and
          watch their coaster credits grow over time.
        </p>

        <section className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ValueCard
            title="Track every ride"
            description="Keep a clean record of every roller coaster you have ridden and revisit your totals anytime."
          />
          <ValueCard
            title="Explore by map"
            description="Use the world map to discover parks and plan your next coaster trip faster."
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

        <section className="mt-10 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
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
              Open the map
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/35"
            >
              Create account
            </Link>
          </div>
        </section>
      </main>
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
