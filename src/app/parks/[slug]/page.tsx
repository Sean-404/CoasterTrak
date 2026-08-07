import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog-page-shell";
import { getCoastersForPark, getParkById, listParksForSitemap } from "@/lib/catalog-server";
import { cleanCoasterName, formatParkLabel } from "@/lib/display";
import { canonicalCountryLabel } from "@/lib/geo-country";
import { coasterSlug, parseIdFromSlug, parkSlug } from "@/lib/slug";

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

  const label = formatParkLabel(park.name, park.country) || park.name;
  const description = `Explore roller coasters at ${label}. Browse the ride list, open the park on the CoasterTrak map, and track your credits.`;
  const canonical = `/parks/${parkSlug(park.name, park.id)}`;

  return {
    title: `${park.name} roller coasters`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${park.name} roller coasters | CoasterTrak`,
      description,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${park.name} roller coasters | CoasterTrak`,
      description,
    },
  };
}

export default async function ParkDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const id = parseIdFromSlug(slug);
  if (!id) notFound();

  const park = await getParkById(id);
  if (!park) notFound();

  const canonicalSlug = parkSlug(park.name, park.id);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/parks/${canonicalSlug}`);
  }

  const coasters = await getCoastersForPark(park.id);
  const label = formatParkLabel(park.name, park.country) || park.name;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AmusementPark",
    name: park.name,
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

      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Theme park</p>
      <h1 className="font-bungee mt-2 text-4xl leading-tight text-slate-900 sm:text-5xl">{park.name}</h1>
      {park.country ? (
        <p className="mt-3 text-base text-slate-600">
          {canonicalCountryLabel(park.country) || park.country}
        </p>
      ) : null}

      <p className="mt-6 max-w-3xl text-base leading-relaxed text-slate-700">
        {label} has {coasters.length} roller coaster{coasters.length === 1 ? "" : "s"} in the CoasterTrak catalog.
        Browse the list below, open the park on the map, and log rides after your visit.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/map?park=${park.id}&view=list`}
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

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">
          Roller coasters at {park.name}
        </h2>
        {coasters.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No coasters listed for this park yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {coasters.map((coaster) => {
              const cName = cleanCoasterName(coaster.name);
              return (
                <li key={coaster.id}>
                  <Link
                    href={`/coasters/${coasterSlug(coaster.name, coaster.id)}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{cName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {[coaster.coaster_type, coaster.status].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-amber-700">View →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        Catalog details may be incomplete or outdated. Always confirm operating status with the park before
        travelling.
      </p>
    </CatalogPageShell>
  );
}
