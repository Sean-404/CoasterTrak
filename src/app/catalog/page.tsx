import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCatalogSnapshot } from "@/lib/catalog-server";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site-url";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How the CoasterTrak catalog works",
  description:
    "See how CoasterTrak compiles park and coaster records, keeps clone rides at the right park, and uses the catalog for unique credit tracking — not as a Wikipedia mirror.",
  alternates: {
    canonical: "/catalog",
  },
  openGraph: {
    title: "How the CoasterTrak catalog works",
    description:
      "Live catalog counts, sourcing, and how CoasterTrak turns park lineups into leftover credits you can actually log.",
    url: `${SITE_URL}/catalog`,
    type: "website",
  },
};

const faqs = [
  {
    question: "Where does CoasterTrak get park and ride data?",
    answer:
      "Park and coaster records are compiled mainly from Wikidata, with photos and optional background text from Wikipedia. When Wikidata includes an RCDB identifier we may link out to that entry. We do not scrape park websites or import RCDB stats.",
  },
  {
    question: "Do catalog pages copy Wikipedia as the article?",
    answer:
      "No. Park and coaster pages lead with CoasterTrak lineup facts and how to log leftover credits. Wikipedia extracts, when present, sit in a labeled background box so they are not the unique content of the page.",
  },
  {
    question: "Why can two parks have a ride with the same name?",
    answer:
      "Clone hardware and reused names are common. CoasterTrak stores a separate catalog row for each park installation so a credit at Six Flags Darien Lake is not the same row as a closed ride of the same name at another park.",
  },
  {
    question: "How do I report a missing or wrong ride?",
    answer:
      `Email ${CONTACT_EMAIL} with the park name, ride name, the page URL if you have it, and what should change. We review reports against public sources and apply known corrections when a listing is a duplicate, an incident page, or a clearly wrong park link.`,
  },
] as const;

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function CatalogGuidePage() {
  const snapshot = await getCatalogSnapshot();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "How the CoasterTrak catalog works",
    url: `${SITE_URL}/catalog`,
    description:
      "How CoasterTrak compiles and curates the park and coaster catalog used for unique credit tracking.",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Catalog</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight text-slate-900 sm:text-5xl">
          How the catalog works
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700">
          CoasterTrak is a credit tracker first. The catalog exists so you can log unique rides, see leftover
          credits at a park, and keep clone installations at the park you actually visited — not so we can republish
          encyclopedia articles.
        </p>

        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          <SnapshotStat label="Parks" value={formatCount(snapshot.parkCount)} />
          <SnapshotStat label="Coasters" value={formatCount(snapshot.coasterCount)} />
          <SnapshotStat label="Countries" value={formatCount(snapshot.countryCount)} />
          <SnapshotStat
            label="Operating / defunct"
            value={`${formatCount(snapshot.operatingCount)} / ${formatCount(snapshot.defunctCount)}`}
          />
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          Counts are from the public CoasterTrak catalog, refreshed at least hourly.
        </p>

        <div className="mt-10 space-y-6 text-base leading-relaxed text-slate-700">
          <h2 className="text-xl font-semibold text-slate-900">What the catalog is for</h2>
          <p>
            Each park page is a planning sheet: operating versus historical rides, tallest and fastest catalog
            stats we have, and a list you can mark as ridden. Each coaster page is a credit target — log it once
            after you ride, then use the park list for leftovers. That is the unique service. Wikipedia and Wikidata
            are sources, not the product.
          </p>
          <p>
            Start on{" "}
            <Link href="/parks" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              parks
            </Link>
            ,{" "}
            <Link href="/coasters" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              coasters
            </Link>
            , or the{" "}
            <Link href="/map" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              Discover map
            </Link>
            . If you are new to tallies, read{" "}
            <Link href="/coaster-credits" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              how coaster credits work
            </Link>
            .
          </p>

          <h2 className="pt-2 text-xl font-semibold text-slate-900">How records are compiled</h2>
          <p>
            Weekly syncs pull park and ride identities from{" "}
            <a
              href="https://www.wikidata.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              Wikidata
            </a>
            . We then match parks, drop incident and duplicate pages, and apply known corrections when a listing
            points at the wrong park or a closed clone of a still-operating ride. Photos and optional background
            text may come from{" "}
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
            identifier, ride pages can link out — we do not import RCDB measurements or copy its write-ups.
          </p>
          <p>
            The same ride name at two parks is two catalog rows. That matters for credits: logging Ride of Steel at
            Darien Lake should not consume a closed Maryland installation, and Superman: Ultimate Flight clones stay
            attached to the park you visited.
          </p>

          <h2 className="pt-2 text-xl font-semibold text-slate-900">What we still ask you to check</h2>
          <p>
            Lineups change. Third-party sources are sometimes wrong. Treat CoasterTrak as a planning aid and confirm
            operating status, height restrictions, and closures with the park before you travel. If a listing looks
            wrong, email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            with the park, ride, URL, and what should change — details are on the{" "}
            <Link href="/contact" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              contact page
            </Link>
            .
          </p>

          <h2 className="pt-2 text-xl font-semibold text-slate-900">Questions</h2>
          <dl className="space-y-5">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="font-semibold text-slate-900">{faq.question}</dt>
                <dd className="mt-1 text-slate-700">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
