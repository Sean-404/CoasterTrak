import type { Metadata } from "next";
import Link from "next/link";
import { AffiliateAboutParagraph } from "@/components/affiliate-policy-copy";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CONTACT_EMAIL, INSTAGRAM_URL, KOFI_URL, SOCIAL_IMAGE } from "@/lib/site-url";

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
    images: [SOCIAL_IMAGE],
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
          <h2 id="how-it-works" className="scroll-mt-24 pt-2 text-xl font-semibold text-slate-900">
            How it works
          </h2>
          <h3 className="pt-1 text-lg font-semibold text-slate-900">Find parks and rides</h3>
          <p>
            Start on the{" "}
            <Link href="/map" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              world map
            </Link>{" "}
            or the{" "}
            <Link href="/parks" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              park list
            </Link>
            . A park page lists its coasters, and each coaster page links back to its park. You can browse without an
            account. At a park, tap &ldquo;Find parks near me&rdquo; on the map and CoasterTrak asks whether you are
            at the closest one, then opens its ride list.
          </p>
          <h3 className="pt-1 text-lg font-semibold text-slate-900">Log your credits</h3>
          <p>
            Mark a coaster ridden and it becomes one credit. Ride it again and your credit count stays the same while
            your ride count goes up, so &ldquo;400 credits and 18 rides today&rdquo; both show up. Add dates if you want
            a first-ridden and last-ridden history; older undated credits still count. Stats start on a thrill-ride
            view with family coasters hidden, but achievements count everything you log. New to the hobby? Read{" "}
            <Link href="/guides/what-is-a-coaster-credit" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              what a coaster credit is
            </Link>
            .
          </p>
          <h3 className="pt-1 text-lg font-semibold text-slate-900">Wishlist, stats and achievements</h3>
          <p>
            Save rides you still want to a wishlist and check them off after each trip. My Stats shows your credits,
            ride counts, parks visited and height totals, and Achievements turns them into milestones. Tap any ride on
            My Stats to rate it, add a photo, or jump to its park.
          </p>
          <h3 className="pt-1 text-lg font-semibold text-slate-900">Friends and privacy</h3>
          <p>
            Add friends to compare tallies and see the rides only they have at a park you are visiting together. Your
            stats are friends-only by default; you can make them private or public in Account. Profile and stats pages
            are never offered to search engines, and location data is stripped from photos before they are saved. The{" "}
            <Link href="/privacy" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              Privacy Policy
            </Link>{" "}
            has the details.
          </p>
          <h3 className="pt-1 text-lg font-semibold text-slate-900">Reviews and CoasterGuessr</h3>
          <p>
            Every park page has member reviews: write one after your visit. A moderator reads new reviewers&apos; reviews before they appear.
            Between trips,{" "}
            <Link href="/guess" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              CoasterGuessr
            </Link>{" "}
            shows you a coaster photo and asks you to pin the park on the map.
          </p>
          <h2 id="who-runs-it" className="scroll-mt-24 pt-2 text-xl font-semibold text-slate-900">
            Who runs it
          </h2>
          <p>
            CoasterTrak is built and run by one coaster fan based in the UK, who started it to keep track of their own
            credits. The trip reports in the{" "}
            <Link href="/guides" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              guides
            </Link>{" "}
            marked &ldquo;By CoasterTrak&apos;s founder&rdquo; come from those park days.
          </p>
          <p>
            CoasterTrak is an independent fan project — not a park, manufacturer, or ticket seller. We are not
            affiliated with or endorsed by the parks in the catalog. The app is free to use; optional advertising,
            when enabled, helps cover hosting.
          </p>
          <AffiliateAboutParagraph />
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
          {KOFI_URL ? (
            <p>
              If CoasterTrak has helped you plan a trip or keep count, you can{" "}
              <a
                href={KOFI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-amber-700 underline-offset-2 hover:underline"
              >
                leave a tip on Ko-fi
              </a>
              . It is entirely optional and goes toward hosting and new features.
            </p>
          ) : null}
          <h2 className="pt-2 text-xl font-semibold text-slate-900">How the catalog is maintained</h2>
          <p>
            Each park page is a planning sheet for leftover credits, not a copied encyclopedia entry. See{" "}
            <Link href="/catalog" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              how the catalog works
            </Link>{" "}
            for live counts, sourcing, and how clone rides stay at the park you visited.
          </p>
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
            </a>
            . When Wikidata includes an{" "}
            <a
              href="https://rcdb.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              RCDB
            </a>{" "}
            identifier, ride pages may link out to that entry — we do not import RCDB stats or other content. We match
            and clean sources so map, park, and ride pages stay aligned, and apply known corrections when a page is an
            incident, a duplicate, or a clearly wrong park link. Entries can still be incomplete or outdated. Treat the
            catalog as a planning aid and confirm hours, closures, and restrictions with the park before you travel.
          </p>
          <p>
            If a listing looks wrong,{" "}
            <Link href="/contact" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              tell us
            </Link>{" "}
            — park name, ride name, and what should change.
          </p>
          <h2 id="questions" className="scroll-mt-24 pt-2 text-xl font-semibold text-slate-900">
            Common questions
          </h2>
          <h3 className="pt-1 text-lg font-semibold text-slate-900">Is CoasterTrak free?</h3>
          <p>Yes. Logging credits, the map, wishlists, stats, friends and reviews are all free with an account.</p>
          <h3 className="pt-1 text-lg font-semibold text-slate-900">Do I need an account?</h3>
          <p>
            Not to browse. Anyone can use the map, park pages and guides. An account saves your credits, wishlist and
            friends across devices.
          </p>
          <h3 className="pt-1 text-lg font-semibold text-slate-900">Is there an app?</h3>
          <p>
            CoasterTrak runs in your phone&apos;s browser, so there is nothing to install. To open it like an app, use
            Add to Home Screen in Safari on iPhone, or Install app when Chrome offers it on Android.
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
