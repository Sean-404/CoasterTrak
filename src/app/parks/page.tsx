import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CatalogCountryFilter } from "@/components/catalog-country-filter";
import { CatalogPageShell } from "@/components/catalog-page-shell";
import { CatalogPagination } from "@/components/catalog-pagination";
import { CatalogSearchForm } from "@/components/catalog-search-form";
import { CatalogStatPills } from "@/components/catalog-stat-pills";
import { DiscoverNav } from "@/components/discover-nav";
import {
  getCatalogIndexCounts,
  listCatalogParks,
  listParksForSitemap,
} from "@/lib/catalog-server";
import { isCatalogIndexCrawlVariant, parseCatalogPage, sliceCatalogPage } from "@/lib/catalog-pagination";
import { formatParkLabel, matchesSearchQuery } from "@/lib/display";
import { parkSlug } from "@/lib/slug";
import type { Park } from "@/types/domain";

export const revalidate = 86400;

type PageProps = {
  searchParams: Promise<{
    q?: string | string[];
    country?: string | string[];
    page?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parkCountry(park: Park): string {
  return (park.country || "Unknown").trim() || "Unknown";
}

function sortParksForIndex(parks: Park[]): Park[] {
  return [...parks].sort((a, b) => {
    const countryA = parkCountry(a);
    const countryB = parkCountry(b);
    return countryA.localeCompare(countryB) || a.name.localeCompare(b.name);
  });
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const country = firstParam(params.country).trim();
  const page = parseCatalogPage(params.page);
  const variant = isCatalogIndexCrawlVariant({ page, q: query, country });

  return {
    title: "Theme parks with roller coasters",
    description:
      "Browse theme parks in the CoasterTrak catalog, switch to the roller coaster list, or explore everything on the world map.",
    alternates: {
      canonical: "/parks",
    },
    ...(variant ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: "Theme parks with roller coasters | CoasterTrak",
      description:
        "Browse theme parks worldwide and open park pages to see roller coasters tracked on CoasterTrak.",
      url: "/parks",
      type: "website",
    },
  };
}

export default async function ParksIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const countryParam = firstParam(params.country).trim();
  const requestedPage = parseCatalogPage(params.page);
  const [allParks, counts, sitemapParks] = await Promise.all([
    listCatalogParks(),
    getCatalogIndexCounts(),
    listParksForSitemap(),
  ]);
  const crawlFollowIds = new Set(sitemapParks.map((park) => park.id));

  const searchedParks =
    query.length > 0
      ? allParks.filter((park) => {
          const haystack = `${park.name} ${park.country ?? ""}`;
          return matchesSearchQuery(haystack, query);
        })
      : allParks;

  const countryOptions = [
    ...new Set(allParks.map(parkCountry).filter((c) => c !== "Unknown")),
  ].sort((a, b) => a.localeCompare(b));
  if (allParks.some((p) => parkCountry(p) === "Unknown")) {
    countryOptions.push("Unknown");
  }

  const countryFilter =
    countryParam && countryOptions.includes(countryParam) ? countryParam : "";

  const filteredParks =
    countryFilter.length > 0
      ? searchedParks.filter((park) => parkCountry(park) === countryFilter)
      : searchedParks;

  const searching = query.length > 0;
  const filteringCountry = countryFilter.length > 0;
  const {
    items: parks,
    page,
    total,
    totalPages,
    from,
    to,
  } = sliceCatalogPage(sortParksForIndex(filteredParks), requestedPage);

  const byCountry = new Map<string, Park[]>();
  for (const park of parks) {
    const country = parkCountry(park);
    const list = byCountry.get(country) ?? [];
    list.push(park);
    byCountry.set(country, list);
  }
  const countries = [...byCountry.keys()];

  return (
    <CatalogPageShell breadcrumb={[{ href: "/map", label: "Discover" }, { href: "/parks", label: "Parks" }]}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Discover</p>
      <DiscoverNav className="mt-3" />
      <h1 className="font-bungee mt-4 text-4xl leading-tight text-slate-900 sm:text-5xl">
        Theme parks
      </h1>

      <CatalogStatPills
        className="mt-4"
        pills={[
          { label: "Parks", value: counts.parks.toLocaleString(), tone: "amber" },
          { label: "Countries", value: counts.countries.toLocaleString(), tone: "slate" },
          { label: "Coasters", value: counts.coasters.toLocaleString(), tone: "default" },
          ...(searching || filteringCountry
            ? [{ label: "Matching", value: total.toLocaleString(), tone: "green" as const }]
            : []),
        ]}
      />

      <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700">
        {searching || filteringCountry ? (
          <>
            {total.toLocaleString()} park{total === 1 ? "" : "s"}
            {searching ? (
              <>
                {" "}
                match <span className="font-semibold text-slate-900">&ldquo;{query}&rdquo;</span>
              </>
            ) : null}
            {filteringCountry ? (
              <>
                {searching ? " in " : " in "}
                <span className="font-semibold text-slate-900">{countryFilter}</span>
              </>
            ) : null}
            . Open a park for its roller coaster list, or explore the{" "}
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
            . New to credit tracking? Start with the{" "}
            <Link
              href="/coaster-tracker"
              className="font-semibold text-amber-700 underline-offset-2 hover:underline"
            >
              coaster tracker guide
            </Link>
            .
          </>
        )}
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Suspense fallback={<div className="h-11 flex-1 animate-pulse rounded-lg bg-slate-200/80" />}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Search</span>
            <CatalogSearchForm
              label="Search theme parks"
              placeholder="Search by park name…"
              initialQuery={query}
              className="min-w-0"
            />
          </div>
        </Suspense>
        <Suspense fallback={<div className="h-11 w-full animate-pulse rounded-lg bg-slate-200/80 sm:w-56" />}>
          <CatalogCountryFilter countries={countryOptions} initialCountry={countryFilter} />
        </Suspense>
      </div>

      {total === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          {searching || filteringCountry ? (
            <>
              No parks match
              {searching ? (
                <>
                  {" "}
                  &ldquo;{query}&rdquo;
                </>
              ) : null}
              {filteringCountry ? <> in {countryFilter}</> : null}. Try another spelling, country, or clear
              the filters.
            </>
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
            country={countryFilter}
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
                          rel={crawlFollowIds.has(park.id) ? undefined : "nofollow"}
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
            country={countryFilter}
            itemLabel="parks"
          />
        </>
      )}
    </CatalogPageShell>
  );
}
