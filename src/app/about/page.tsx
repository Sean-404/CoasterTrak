import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "About CoasterTrak",
  description:
    "Learn about CoasterTrak — a free roller coaster tracker for logging rides, exploring parks on a world map, and comparing coaster stats.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About CoasterTrak",
    description:
      "CoasterTrak is a free roller coaster tracker for logging credits, exploring parks, and comparing stats.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">About</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight text-slate-900 sm:text-5xl">
          Built for coaster enthusiasts
        </h1>
        <div className="mt-8 space-y-6 text-base leading-relaxed text-slate-700">
          <p>
            CoasterTrak is a free roller coaster tracker for logging rides you have done, planning trips with a
            worldwide park map, and keeping a wishlist of credits you still want.
          </p>
          <p>
            Enthusiasts often spread ride history across notebooks, spreadsheets, and photo albums. CoasterTrak
            brings those pieces together: log credits as you go, see your totals on a stats dashboard, unlock
            achievements, and compare progress with friends.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">What you can do</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Browse parks and coasters on an{" "}
              <Link href="/map" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                interactive world map
              </Link>
              .
            </li>
            <li>Save rides to a wishlist and check them off after each trip.</li>
            <li>Review personal stats such as ride counts, height totals, and park coverage.</li>
            <li>Connect with friends to compare credits and milestones.</li>
          </ul>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Data sources</h2>
          <p>
            Park and coaster catalog data is compiled from third-party and community-maintained sources. We work to
            keep it useful for planning and tracking, but some entries can be incomplete or outdated. If something
            looks wrong, treat the map as a starting point and verify details with the park before you travel.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Who it is for</h2>
          <p>
            CoasterTrak is for casual day-trippers and seasoned credit hunters alike. Create a free account to save
            your history across devices, or explore the map without signing in. For a walkthrough of the main
            features, see the{" "}
            <Link href="/coaster-tracker" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              roller coaster tracker guide
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
