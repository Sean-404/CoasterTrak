import type { Metadata } from "next";
import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog-page-shell";
import { getSupabaseAnonServerClient } from "@/lib/catalog-server";
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

async function listAllParks(): Promise<Park[]> {
  const supabase = getSupabaseAnonServerClient();
  if (!supabase) return [];
  const pageSize = 1000;
  const rows: Park[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("parks")
      .select("id,name,country,latitude,longitude")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data?.length) break;
    rows.push(...(data as Park[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export default async function ParksIndexPage() {
  const parks = await listAllParks();
  const byCountry = new Map<string, Park[]>();
  for (const park of parks) {
    const country = (park.country || "Unknown").trim() || "Unknown";
    const list = byCountry.get(country) ?? [];
    list.push(park);
    byCountry.set(country, list);
  }
  const countries = [...byCountry.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <CatalogPageShell breadcrumb={[{ href: "/parks", label: "Parks" }]}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Catalog</p>
      <h1 className="font-bungee mt-2 text-4xl leading-tight text-slate-900 sm:text-5xl">
        Theme parks
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700">
        {parks.length.toLocaleString()} parks in the CoasterTrak catalog. Open a park for its roller coaster
        list, or explore everything on the{" "}
        <Link href="/map" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
          interactive map
        </Link>
        .
      </p>

      <div className="mt-8 space-y-8">
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
    </CatalogPageShell>
  );
}
