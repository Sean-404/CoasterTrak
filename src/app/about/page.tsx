import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CONTACT_EMAIL, INSTAGRAM_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "About CoasterTrak",
  description:
    "Learn about CoasterTrak — a free coaster credit tracker for logging unique rides, exploring parks on a world map, and comparing tallies.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About CoasterTrak",
    description:
      "CoasterTrak is a free coaster credit tracker for logging unique rides, exploring parks, and comparing tallies.",
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
            CoasterTrak is a free coaster credit tracker for logging unique rides you have done, planning trips with a
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
              Discover parks and coasters on an{" "}
              <Link href="/map" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                interactive world map
              </Link>
              , or browse the{" "}
              <Link href="/parks" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                park
              </Link>{" "}
              and{" "}
              <Link href="/coasters" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                coaster
              </Link>{" "}
              lists.
            </li>
            <li>Save rides to a wishlist and check them off after each trip.</li>
            <li>Review personal stats such as ride counts, height totals, and park coverage.</li>
            <li>Connect with friends to compare credits and milestones.</li>
          </ul>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Who runs it</h2>
          <p>
            CoasterTrak is an independent fan project — not a park, manufacturer, or ticket seller. We are not
            affiliated with or endorsed by the parks in the catalog. The app is free to use; optional advertising,
            when enabled, helps cover hosting.
          </p>
          <p>
            Product notes live on{" "}
            <Link href="/updates" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              What’s new
            </Link>
            . Trip photos and short posts are on{" "}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              Instagram
            </a>
            .
          </p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">How the catalog is maintained</h2>
          <p>
            Park and coaster records are compiled mainly from{" "}
            <a
              href="https://www.wikidata.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              Wikidata
            </a>
            , with enrichment from{" "}
            <a
              href="https://en.wikipedia.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              Wikipedia
            </a>{" "}
            and ride statistics from{" "}
            <a
              href="https://rcdb.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              RCDB
            </a>{" "}
            (Roller Coaster Database), used with permission. We match and clean sources so map, park, and ride pages
            stay aligned, and apply known corrections when a page is an incident, a duplicate, or a clearly wrong
            park link. Entries can still be incomplete or outdated. Treat the catalog as a planning aid and confirm
            hours, closures, and restrictions with the park before you travel.
          </p>
          <p>
            If a listing looks wrong,{" "}
            <Link href="/contact" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              tell us
            </Link>{" "}
            — park name, ride name, and what should change.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Who it is for</h2>
          <p>
            CoasterTrak is for casual day-trippers and seasoned credit hunters alike. Create a free account to save
            your history across devices, or explore the map without signing in. Start with the{" "}
            <Link href="/coaster-credits" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              coaster credit tracker
            </Link>{" "}
            if you want the tally explained, or the{" "}
            <Link href="/coaster-tracker" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              roller coaster tracker guide
            </Link>{" "}
            for the full walkthrough.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-slate-900">Contact</h2>
          <p>
            Email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            or use the{" "}
            <Link href="/contact" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              contact page
            </Link>
            . Privacy and account requests are covered in the{" "}
            <Link href="/privacy" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
