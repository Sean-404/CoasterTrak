import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { GUIDES, guidePath } from "@/lib/guides";
import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Coaster credit guides",
  description:
    "Original CoasterTrak guides on coaster credits, park-day logging, leftovers, first-year credit hunting, and CoasterGuessr — written for enthusiasts, not scraped from Wikipedia.",
  keywords: [
    "coaster credit guides",
    "coaster credit",
    "roller coaster tracker guide",
    "credit hunting",
    "CoasterTrak",
  ],
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "Coaster credit guides | CoasterTrak",
    description:
      "Guides on coaster credits, park leftovers, first park days, and CoasterGuessr from the CoasterTrak team.",
    url: `${SITE_URL}/guides`,
    type: "website",
  },
};

export default function GuidesHubPage() {
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Coaster credit guides",
    url: `${SITE_URL}/guides`,
    description:
      "Original guides about coaster credits, park planning, and tracking on CoasterTrak.",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: GUIDES.map((guide, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}${guidePath(guide.slug)}`,
        name: guide.title,
      })),
    },
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Guides</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight text-slate-900 sm:text-5xl">
          Coaster credit guides
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-700">
          Original articles from CoasterTrak on how enthusiasts count unique rides, plan park leftovers, and keep a
          tally without a spreadsheet. These pages are written for humans and search engines — not generated from
          Wikipedia dumps.
        </p>

        <ul className="mt-10 space-y-4">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  <Link
                    href={guidePath(guide.slug)}
                    className="text-amber-800 underline-offset-2 hover:underline"
                  >
                    {guide.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{guide.summary}</p>
                <p className="mt-3 text-xs text-slate-400">{guide.readingMinutes} min read</p>
              </article>
            </li>
          ))}
        </ul>

        <section className="mt-12 space-y-3 text-sm leading-relaxed text-slate-600">
          <h2 className="text-lg font-semibold text-slate-900">Also useful</h2>
          <p>
            <Link href="/coaster-credits" className="font-semibold text-amber-700 hover:underline">
              Free coaster credit tracker overview
            </Link>
            {" · "}
            <Link href="/coaster-tracker" className="font-semibold text-amber-700 hover:underline">
              Full tracker product guide
            </Link>
            {" · "}
            <Link href="/catalog" className="font-semibold text-amber-700 hover:underline">
              How the catalog works
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
