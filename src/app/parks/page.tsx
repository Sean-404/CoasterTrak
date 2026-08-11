import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CatalogPageShell } from "@/components/catalog-page-shell";
import { CatalogPagination } from "@/components/catalog-pagination";
import { CatalogSearchForm } from "@/components/catalog-search-form";
import { CatalogStatPills } from "@/components/catalog-stat-pills";
import { getCatalogIndexCounts, listCatalogParks } from "@/lib/catalog-server";
import { parseCatalogPage, sliceCatalogPage } from "@/lib/catalog-pagination";
import { formatParkLabel } from "@/lib/display";
import { parkSlug } from "@/lib/slug";
import type { Park } from "@/types/domain";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Theme parks with roller coasters",
  description:
    "Browse theme parks in the CoasterTrak catalog, open a park page for its roller coaster list, or explore everything on the world map.",
  alternates: {
    canonical: "/parks",
  },
  openGraph: {
    title: "Theme parks with roller coasters | CoasterTrak",
    description:
      "Browse theme parks worldwide and open park pages to see roller coasters tracked on CoasterTrak.",
    url: "/parks",
    type: "website",
  },
};

type PageProps = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function sortParksForIndex(parks: Park[]): Park[] {
  return [...parks].sort((a, b) => {
    const countryA = (a.country || "Unknown").trim() || "Unknown";
    const countryB = (b.country || "Unknown").trim() || "Unknown";
    return countryA.localeCompare(countryB) || a.name.localeCompare(b.name);
  });
}

export default async function ParksIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const requestedPage = parseCatalogPage(params.page);
  const [allParks, counts] = await Promise.all([
    listCatalogParks(query || undefined),
    getCatalogIndexCounts(),
  ]);
  const searching = query.length > 0;
  const {
    items: parks,
    page,
    total,
    totalPages,
    from,
    to,
  } = sliceCatalogPage(sortParksForIndex(allParks), requestedPage);

  const byCountry = new Map<string, Park[]>();
  for (const park of parks) {
    const country = (park.country || "Unknown").trim() || "Unknown";
    const list = byCountry.get(country) ?? [];
    list.push(park);
    byCountry.set(country, list);
  }
  const countries = [...byCountry.keys()];

  return (
    <CatalogPageShell breadcrumb={[{ href: "/parks", label: "Parks" }]}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Catalog</p>
      <h1 className="font-bungee mt-2 text-4xl leading-tight text-slate-900 sm:text-5xl">
        Theme parks
      </h1>

      <CatalogStatPills
        className="mt-4"
        pills={[
          { label: "Parks", value: counts.parks.toLocaleString(), tone: "amber" },
          { label: "Countries", value: counts.countries.toLocaleString(), tone: "slate" },
          { label: "Coasters", value: counts.coasters.toLocaleString(), tone: "default" },
          ...(searching
            ? [{ label: "Matching", value: total.toLocaleString(), tone: "green" as const }]
            : []),
        ]}
      />

      <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700">
        {searching ? (
          <>
            {total.toLocaleString()} park{total === 1 ? "" : "s"} match{" "}
            <span className="font-semibold text-slate-900">&ldquo;{query}&rdquo;</span>. Open a park for its
            roller coaster list, or explore the{" "}
            <Link href="/map" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
              interactive map
            </Link>
            .
          </>
        ) : (
          <>
            Browse by country below, open a park for its roller coaster list, or explore everything on the{" "}
            <Link href="/map" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
              interactive map
            </Link>
            .
          </>
        )}
      </p>

      <Suspense fallback={<div className="mt-6 h-11 animate-pulse rounded-lg bg-slate-200/80" />}>
        <CatalogSearchForm
          label="Search theme parks"
          placeholder="Search by park or country…"
          initialQuery={query}
        />
      </Suspense>

      {total === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          {searching ? (
            <>No parks match &ldquo;{query}&rdquo;. Try another spelling or clear the search.</>
          ) : (
            "No parks in the catalog yet."
          )}
        </p>
      ) : (
        <>
          <CatalogPagination
            path="/parks"
            page={page}
            totalPages={totalPages}
            total={total}
            from={from}
            to={to}
            query={query}
            itemLabel="parks"
          />

          <div className="mt-4 space-y-8">
            {countries.map((country) => {
              const list = byCountry.get(country) ?? [];
              return (
                <section key={country}>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {country}{" "}
                    <span className="text-sm font-normal text-slate-500">({list.length})</span>
                  </h2>
                  <ul className="mt-3 columns-1 gap-x-6 sm:columns-2">
                    {list.map((park) => (
                      <li key={park.id} className="mb-1.5 break-inside-avoid">
                        <Link
                          href={`/parks/${parkSlug(park.name, park.id)}`}
                          className="text-sm text-slate-700 underline-offset-2 hover:text-amber-800 hover:underline"
                        >
                          {formatParkLabel(park.name, park.country) || park.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <CatalogPagination
            path="/parks"
            page={page}
            totalPages={totalPages}
            total={total}
            from={from}
            to={to}
            query={query}
            itemLabel="parks"
          />
        </>
      )}
    </CatalogPageShell>
  );
}
