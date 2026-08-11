import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CatalogPageShell } from "@/components/catalog-page-shell";
import { CatalogPagination } from "@/components/catalog-pagination";
import { CatalogSearchForm } from "@/components/catalog-search-form";
import { CatalogStatPills } from "@/components/catalog-stat-pills";
import { getCatalogIndexCounts, listCoastersForIndex } from "@/lib/catalog-server";
import { parseCatalogPage, sliceCatalogPage } from "@/lib/catalog-pagination";
import { cleanCoasterName, formatParkLabel } from "@/lib/display";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { coasterSlug } from "@/lib/slug";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Roller coasters",
  description:
    "Browse roller coasters in the CoasterTrak catalog. Open a ride page for stats, find it on the map, or jump to its theme park.",
  alternates: {
    canonical: "/coasters",
  },
  openGraph: {
    title: "Roller coasters | CoasterTrak",
    description:
      "Browse roller coasters worldwide and open ride pages with stats, park links, and map deep links.",
    url: "/coasters",
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

export default async function CoastersIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const requestedPage = parseCatalogPage(params.page);
  const [allCoasters, counts] = await Promise.all([
    listCoastersForIndex(query || undefined),
    getCatalogIndexCounts(),
  ]);
  const searching = query.length > 0;
  const {
    items: coasters,
    page,
    total,
    totalPages,
    from,
    to,
  } = sliceCatalogPage(allCoasters, requestedPage);

  return (
    <CatalogPageShell breadcrumb={[{ href: "/coasters", label: "Coasters" }]}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Catalog</p>
      <h1 className="font-bungee mt-2 text-4xl leading-tight text-slate-900 sm:text-5xl">
        Roller coasters
      </h1>

      <CatalogStatPills
        className="mt-4"
        pills={[
          { label: "Coasters", value: counts.coasters.toLocaleString(), tone: "amber" },
          { label: "Parks", value: counts.parks.toLocaleString(), tone: "slate" },
          ...(searching
            ? [{ label: "Matching", value: total.toLocaleString(), tone: "green" as const }]
            : []),
        ]}
      />

      <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700">
        {searching ? (
          <>
            {total.toLocaleString()} result{total === 1 ? "" : "s"} for{" "}
            <span className="font-semibold text-slate-900">&ldquo;{query}&rdquo;</span>. Open a coaster for
            stats and park links, or browse{" "}
            <Link href="/parks" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
              parks
            </Link>
            .
          </>
        ) : (
          <>
            Browse the full catalog A–Z, use search to jump to a ride, open{" "}
            <Link href="/parks" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
              parks
            </Link>
            , or explore everything on the{" "}
            <Link href="/map" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
              interactive map
            </Link>
            .
          </>
        )}
      </p>

      <Suspense fallback={<div className="mt-6 h-11 animate-pulse rounded-lg bg-slate-200/80" />}>
        <CatalogSearchForm
          label="Search roller coasters"
          placeholder="Search by coaster or park name…"
          initialQuery={query}
        />
      </Suspense>

      {total === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          {searching ? (
            <>
              No coasters match &ldquo;{query}&rdquo;. Try another spelling, or browse the{" "}
              <Link href="/parks" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
                parks catalog
              </Link>
              .
            </>
          ) : (
            "No coasters in the catalog yet."
          )}
        </p>
      ) : (
        <>
          <CatalogPagination
            path="/coasters"
            page={page}
            totalPages={totalPages}
            total={total}
            from={from}
            to={to}
            query={query}
            itemLabel="coasters"
          />

          <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {coasters.map((coaster) => {
              const name = cleanCoasterName(coaster.name);
              const park = coaster.parks;
              const typeLabel = effectiveCoasterType(coaster.coaster_type, coaster.manufacturer);
              return (
                <li key={coaster.id}>
                  <Link
                    href={`/coasters/${coasterSlug(coaster.name, coaster.id)}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {[
                          park ? formatParkLabel(park.name, park.country) || park.name : null,
                          typeLabel !== "Unknown" ? typeLabel : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-amber-700">View →</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <CatalogPagination
            path="/coasters"
            page={page}
            totalPages={totalPages}
            total={total}
            from={from}
            to={to}
            query={query}
            itemLabel="coasters"
          />
        </>
      )}

      {total > 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          Prefer browsing by park?{" "}
          <Link href="/parks" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
            Open the parks catalog
          </Link>
          .
        </p>
      ) : null}
    </CatalogPageShell>
  );
}
