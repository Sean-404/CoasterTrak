import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CatalogPageShell, StatGrid } from "@/components/catalog-page-shell";
import { getCoasterById, getCoastersForPark, listCoastersForSitemap } from "@/lib/catalog-server";
import { cleanCoasterName, formatParkLabel } from "@/lib/display";
import { coasterSlug, parseIdFromSlug, parkSlug } from "@/lib/slug";
import { fmtDuration, fmtHeight, fmtLength, fmtSpeed } from "@/lib/units";

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
  const title = parkLabel ? `${name} at ${coaster.parks?.name}` : name;
  const description = [
    `${name} is a ${coaster.coaster_type || "roller coaster"}`,
    parkLabel ? `at ${parkLabel}` : null,
    coaster.status ? `(${coaster.status})` : null,
    "Track it on CoasterTrak.",
  ]
    .filter(Boolean)
    .join(" ");
  const canonical = `/coasters/${coasterSlug(coaster.name, coaster.id)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | CoasterTrak`,
      description,
      url: canonical,
      type: "article",
      ...(coaster.image_url ? { images: [{ url: coaster.image_url }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | CoasterTrak`,
      description,
      ...(coaster.image_url ? { images: [coaster.image_url] } : {}),
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
  const siblings = park
    ? (await getCoastersForPark(park.id)).filter((row) => row.id !== coaster.id).slice(0, 12)
    : [];

  const stats = [
    coaster.coaster_type ? { label: "Type", value: coaster.coaster_type } : null,
    coaster.manufacturer ? { label: "Manufacturer", value: coaster.manufacturer } : null,
    coaster.status ? { label: "Status", value: coaster.status } : null,
    fmtHeight(coaster.height_ft, units) ? { label: "Height", value: fmtHeight(coaster.height_ft, units)! } : null,
    fmtLength(coaster.length_ft, units) ? { label: "Length", value: fmtLength(coaster.length_ft, units)! } : null,
    fmtSpeed(coaster.speed_mph, units) ? { label: "Speed", value: fmtSpeed(coaster.speed_mph, units)! } : null,
    coaster.inversions != null ? { label: "Inversions", value: String(coaster.inversions) } : null,
    fmtDuration(coaster.duration_s) ? { label: "Duration", value: fmtDuration(coaster.duration_s)! } : null,
    coaster.opening_year ? { label: "Opened", value: String(coaster.opening_year) } : null,
    coaster.closing_year ? { label: "Closed", value: String(coaster.closing_year) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name,
    url: `${siteUrl}/coasters/${canonicalSlug}`,
    description: `${name}${parkLabel ? ` at ${parkLabel}` : ""} — roller coaster tracked on CoasterTrak.`,
    ...(coaster.image_url ? { image: coaster.image_url } : {}),
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

      {coaster.image_url ? (
        <div className="relative mt-8 aspect-[16/10] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
          <Image
            src={coaster.image_url}
            alt={`${name} roller coaster`}
            fill
            className="object-cover"
            sizes="(max-width: 896px) 100vw, 896px"
            unoptimized
          />
        </div>
      ) : null}

      <p className="mt-6 max-w-3xl text-base leading-relaxed text-slate-700">
        {name} is a {coaster.coaster_type || "roller coaster"}
        {parkLabel ? ` at ${parkLabel}` : ""}
        {coaster.manufacturer ? `, built by ${coaster.manufacturer}` : ""}
        {coaster.status ? `. Current catalog status: ${coaster.status}` : "."} Use CoasterTrak to log the
        credit, add it to your wishlist, or find it on the interactive map.
      </p>

      <StatGrid items={stats} />

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/map?coaster=${coaster.id}`}
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
            {siblings.map((sibling) => {
              const siblingName = cleanCoasterName(sibling.name);
              return (
                <li key={sibling.id}>
                  <Link
                    href={`/coasters/${coasterSlug(sibling.name, sibling.id)}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{siblingName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {[sibling.coaster_type, sibling.status].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-amber-700">View →</span>
                  </Link>
                </li>
              );
            })}
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
