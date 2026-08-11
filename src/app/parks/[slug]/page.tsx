import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog-page-shell";
import { CatalogStatPills, type CatalogStatPill } from "@/components/catalog-stat-pills";
import { ParkCoasterList } from "@/components/park-coaster-list";
import { ParkStatusBadge } from "@/components/park-status-badge";
import {
  buildParkEditorialIntro,
  computeParkHighlights,
  isParkCatalogSubstantial,
} from "@/lib/catalog-content";
import {
  getCoastersForPark,
  getParkById,
  listParksForSitemap,
  resolveCatalogParkId,
} from "@/lib/catalog-server";
import { formatParkLabel } from "@/lib/display";
import { canonicalCountryLabel } from "@/lib/geo-country";
import { parseIdFromSlug, parkSlug, coasterSlug } from "@/lib/slug";
import { clampSummaryText, fetchWikipediaSummaryForPark } from "@/lib/wikipedia-summary";
import { cleanCoasterName } from "@/lib/display";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com";

export const revalidate = 86400;
export const dynamicParams = true;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const parks = await listParksForSitemap();
  return parks.map((park) => ({ slug: parkSlug(park.name, park.id) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  if (!id) return { title: "Park not found" };
  const park = await getParkById(id);
  if (!park) return { title: "Park not found" };

  const coasters = await getCoastersForPark(park.id);
  const countryLabel = canonicalCountryLabel(park.country) || park.country;
  const wikiSummary = await fetchWikipediaSummaryForPark(park.name);
  const intro = wikiSummary?.extract
    ? clampSummaryText(wikiSummary.extract, 160)
    : buildParkEditorialIntro(park.name, countryLabel, coasters).slice(0, 160);
  const canonicalId = await resolveCatalogParkId(park.id);
  const canonicalPark =
    canonicalId === park.id ? park : ((await getParkById(canonicalId)) ?? park);
  const canonical = `/parks/${parkSlug(canonicalPark.name, canonicalPark.id)}`;
  const indexable = isParkCatalogSubstantial(coasters, wikiSummary?.extract);

  return {
    title: `${park.name} roller coasters`,
    description: intro,
    alternates: { canonical },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${park.name} roller coasters | CoasterTrak`,
      description: intro,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${park.name} roller coasters | CoasterTrak`,
      description: intro,
    },
  };
}

export default async function ParkDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  if (!id) notFound();

  const requested = await getParkById(id);
  if (!requested) notFound();

  const canonicalId = await resolveCatalogParkId(requested.id);
  const park =
    canonicalId === requested.id ? requested : ((await getParkById(canonicalId)) ?? requested);
  const canonicalSlug = parkSlug(park.name, park.id);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/parks/${canonicalSlug}`);
  }

  const coasters = await getCoastersForPark(park.id);
  const countryLabel = canonicalCountryLabel(park.country) || park.country;
  const wikiSummary = await fetchWikipediaSummaryForPark(park.name);
  const intro = wikiSummary?.extract
    ? wikiSummary.extract
    : buildParkEditorialIntro(park.name, countryLabel, coasters);
  const highlights = computeParkHighlights(coasters);
  const parkIsDefunct = highlights.isDefunctPark;

  const highlightStats: CatalogStatPill[] = [
    { label: "Coasters", value: String(coasters.length), tone: "amber" },
  ];
  if (parkIsDefunct) {
    highlightStats.push({ label: "Park", value: "Defunct", tone: "red" });
  }
  if (highlights.operatingCount > 0) {
    highlightStats.push({
      label: "Operating",
      value: String(highlights.operatingCount),
      tone: "green",
    });
  }
  if (highlights.defunctCount > 0) {
    highlightStats.push({
      label: "Defunct",
      value: String(highlights.defunctCount),
      tone: "red",
    });
  }
  if (highlights.tallest) {
    highlightStats.push({
      label: "Tallest",
      value: `${highlights.tallest.name} (${highlights.tallest.height})`,
    });
  }
  if (highlights.fastest) {
    highlightStats.push({
      label: "Fastest",
      value: `${highlights.fastest.name} (${highlights.fastest.speed})`,
    });
  }
  for (const { type, count } of highlights.typeBreakdown) {
    highlightStats.push({ label: type, value: String(count), tone: "slate" });
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AmusementPark",
    name: park.name,
    description: clampSummaryText(intro),
    ...(park.country ? { address: { "@type": "PostalAddress", addressCountry: park.country } } : {}),
    ...(Number.isFinite(park.latitude) && Number.isFinite(park.longitude)
      ? { geo: { "@type": "GeoCoordinates", latitude: park.latitude, longitude: park.longitude } }
      : {}),
    containsPlace: coasters.slice(0, 50).map((coaster) => ({
      "@type": "TouristAttraction",
      name: cleanCoasterName(coaster.name),
      url: `${SITE_URL}/coasters/${coasterSlug(coaster.name, coaster.id)}`,
    })),
  };

  return (
    <CatalogPageShell
      breadcrumb={[
        { href: "/parks", label: "Parks" },
        { href: `/parks/${canonicalSlug}`, label: park.name },
      ]}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
        {parkIsDefunct ? "Defunct theme park" : "Theme park"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-bungee text-4xl leading-tight text-slate-900 sm:text-5xl">{park.name}</h1>
        {parkIsDefunct ? <ParkStatusBadge /> : null}
      </div>
      {countryLabel ? <p className="mt-3 text-base text-slate-600">{countryLabel}</p> : null}

      <p className="mt-6 max-w-3xl text-base leading-relaxed text-slate-700">{intro}</p>
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
          . Ride stats and status may differ from the park&apos;s current lineup.
        </p>
      ) : null}

      {highlightStats.length > 0 ? (
        <div className="mt-8">
          <CatalogStatPills pills={highlightStats} />
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/map?park=${canonicalId}&view=map`}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
        >
          Open on map
        </Link>
        <Link
          href="/coaster-tracker"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
        >
          How tracking works
        </Link>
      </div>

      {coasters.length === 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">Roller coasters at {park.name}</h2>
          <p className="mt-3 text-sm text-slate-500">No coasters listed for this park yet.</p>
        </section>
      ) : (
        <div className="mt-10">
          <ParkCoasterList coasters={coasters} parkName={park.name} />
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        {parkIsDefunct
          ? "This park appears defunct based on its catalog coasters. Always confirm status before travelling."
          : "Catalog details may be incomplete or outdated. Always confirm operating status with the park before travelling."}
      </p>
    </CatalogPageShell>
  );
}
