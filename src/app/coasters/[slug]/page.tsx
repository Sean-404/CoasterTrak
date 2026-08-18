import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog-page-shell";
import { CatalogStatPills } from "@/components/catalog-stat-pills";
import { CoasterDetailActions } from "@/components/coaster-detail-actions";
import { ParkCoasterRow } from "@/components/park-coaster-row";
import { isCoasterCatalogSubstantial, buildCoasterEditorialIntro } from "@/lib/catalog-content";
import {
  buildCoasterMeasurementPills,
  buildCoasterMetaPills,
} from "@/lib/catalog-coaster-pills";
import { getCoasterById, getCoastersForPark, listCoastersForSitemap } from "@/lib/catalog-server";
import { cleanCoasterName, formatParkLabel } from "@/lib/display";
import { coasterSlug, parseIdFromSlug, parkSlug } from "@/lib/slug";
import { SITE_URL } from "@/lib/site-url";
import {
  clampSummaryText,
  fetchWikipediaSummaryForCoaster,
} from "@/lib/wikipedia-summary";

export const revalidate = 86400;
export const dynamicParams = true;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const coasters = await listCoastersForSitemap();
  return coasters.map((coaster) => ({ slug: coasterSlug(coaster.name, coaster.id) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  if (!id) return { title: "Coaster not found" };
  const coaster = await getCoasterById(id);
  if (!coaster) return { title: "Coaster not found" };

  const name = cleanCoasterName(coaster.name);
  const parkLabel = formatParkLabel(coaster.parks?.name, coaster.parks?.country);
  const wikiSummary = await fetchWikipediaSummaryForCoaster({
    enwikiTitle: coaster.enwiki_title,
    wikidataId: coaster.wikidata_id,
    storedSummary: coaster.summary_text,
    storedEnwikiTitle: coaster.enwiki_title,
  });
  const title = parkLabel ? `${name} at ${coaster.parks?.name}` : name;
  const description = wikiSummary
    ? clampSummaryText(wikiSummary.extract, 160)
    : clampSummaryText(buildCoasterEditorialIntro(coaster, parkLabel || null), 160);
  const canonical = `/coasters/${coasterSlug(coaster.name, coaster.id)}`;
  const indexable = isCoasterCatalogSubstantial(coaster, wikiSummary?.extract ?? coaster.summary_text);
  const ogImage = coaster.image_url || wikiSummary?.imageUrl || null;

  return {
    title,
    description,
    alternates: { canonical },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${title} | CoasterTrak`,
      description,
      url: canonical,
      type: "article",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | CoasterTrak`,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function CoasterDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  if (!id) notFound();

  const coaster = await getCoasterById(id);
  if (!coaster) notFound();

  const canonicalSlug = coasterSlug(coaster.name, coaster.id);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/coasters/${canonicalSlug}`);
  }

  const name = cleanCoasterName(coaster.name);
  const park = coaster.parks;
  const parkLabel = formatParkLabel(park?.name, park?.country);
  const units = "imperial" as const;
  const metaPills = buildCoasterMetaPills(coaster);
  const measurementPills = buildCoasterMeasurementPills(coaster, units);
  const siblings = park
    ? (await getCoastersForPark(park.id)).filter((row) => row.id !== coaster.id).slice(0, 12)
    : [];

  const wikiSummary = await fetchWikipediaSummaryForCoaster({
    enwikiTitle: coaster.enwiki_title,
    wikidataId: coaster.wikidata_id,
    storedSummary: coaster.summary_text,
    storedEnwikiTitle: coaster.enwiki_title,
  });
  const displayImage = coaster.image_url || wikiSummary?.imageUrl || null;

  const siteUrl = SITE_URL;
  const bodyIntro =
    wikiSummary?.extract ?? buildCoasterEditorialIntro(coaster, parkLabel || null);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name,
    url: `${siteUrl}/coasters/${canonicalSlug}`,
    description: clampSummaryText(bodyIntro),
    ...(displayImage ? { image: displayImage } : {}),
    ...(park
      ? {
          containedInPlace: {
            "@type": "AmusementPark",
            name: park.name,
            url: `${siteUrl}/parks/${parkSlug(park.name, park.id)}`,
            address: park.country ? { "@type": "PostalAddress", addressCountry: park.country } : undefined,
          },
        }
      : {}),
  };

  return (
    <CatalogPageShell
      breadcrumb={[
        { href: "/map", label: "Discover" },
        { href: "/parks", label: "Parks" },
        ...(park
          ? [{ href: `/parks/${parkSlug(park.name, park.id)}`, label: park.name }]
          : [{ href: "/coasters", label: "Coasters" }]),
        { href: `/coasters/${canonicalSlug}`, label: name },
      ]}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Roller coaster</p>
      <h1 className="font-bungee mt-2 text-4xl leading-tight text-slate-900 sm:text-5xl">{name}</h1>
      {park ? (
        <p className="mt-3 text-base text-slate-600">
          At{" "}
          <Link
            href={`/parks/${parkSlug(park.name, park.id)}`}
            className="font-semibold text-amber-700 underline-offset-2 hover:underline"
          >
            {parkLabel || park.name}
          </Link>
        </p>
      ) : null}

      {displayImage ? (
        <div className="relative mt-8 aspect-[16/10] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
          <Image
            src={displayImage}
            alt={`${name} roller coaster`}
            fill
            className="object-cover"
            sizes="(max-width: 896px) 100vw, 896px"
            unoptimized
          />
        </div>
      ) : null}

      <p className="mt-6 max-w-3xl text-base leading-relaxed text-slate-700">{bodyIntro}</p>
      {wikiSummary ? (
        <p className="mt-3 text-sm text-slate-500">
          Summary from{" "}
          <a
            href={wikiSummary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-amber-700 hover:underline"
          >
            Wikipedia
          </a>
          . Confirm ride status with the park before visiting.
        </p>
      ) : null}

      {(metaPills.length > 0 || measurementPills.length > 0) ? (
        <div className="mt-8 space-y-3">
          {metaPills.length > 0 ? <CatalogStatPills pills={metaPills} /> : null}
          {measurementPills.length > 0 ? <CatalogStatPills pills={measurementPills} /> : null}
        </div>
      ) : null}

      <CoasterDetailActions
        coasterId={coaster.id}
        status={coaster.status}
        closingYear={coaster.closing_year}
      />

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/map?coaster=${coaster.id}&view=map`}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
        >
          Open on map
        </Link>
        {park ? (
          <Link
            href={`/parks/${parkSlug(park.name, park.id)}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
          >
            View park
          </Link>
        ) : null}
        <Link
          href="/coaster-tracker"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
        >
          How tracking works
        </Link>
      </div>

      {siblings.length > 0 && park ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">More coasters at {park.name}</h2>
          <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {siblings.map((sibling) => (
              <ParkCoasterRow key={sibling.id} coaster={sibling} />
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-500">
            <Link
              href={`/parks/${parkSlug(park.name, park.id)}`}
              className="font-semibold text-amber-700 underline-offset-2 hover:underline"
            >
              See all rides at {park.name}
            </Link>
          </p>
        </section>
      ) : null}

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        Catalog details may be incomplete or outdated. Always confirm ride status and restrictions with the park
        before visiting.
      </p>
    </CatalogPageShell>
  );
}
