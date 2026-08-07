import type { Metadata } from "next";
import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog-page-shell";
import { listCoastersForIndex } from "@/lib/catalog-server";
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

export default async function CoastersIndexPage() {
  const coasters = await listCoastersForIndex(600);

  return (
    <CatalogPageShell breadcrumb={[{ href: "/coasters", label: "Coasters" }]}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Catalog</p>
      <h1 className="font-bungee mt-2 text-4xl leading-tight text-slate-900 sm:text-5xl">
        Roller coasters
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700">
        A sample of {coasters.length.toLocaleString()} rides from the CoasterTrak catalog (A–Z). Open a coaster for
        stats and park links, browse{" "}
        <Link href="/parks" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
          parks
        </Link>
        , or explore everything on the{" "}
        <Link href="/map" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
          interactive map
        </Link>
        .
      </p>

      {coasters.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">No coasters in the catalog yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                        park
                          ? formatParkLabel(park.name, park.country) || park.name
                          : null,
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
      )}

      {coasters.length > 0 ? (
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
