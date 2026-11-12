import type { MetadataRoute } from "next";
import {
  CATALOG_DETAIL_CRAWLABLE,
  isCoasterCatalogSubstantial,
  isParkCatalogSubstantial,
} from "@/lib/catalog-content";
import { COASTER_NOTES, PARK_NOTES } from "@/lib/catalog-notes";
import {
  getCoasterById,
  getCoastersForPark,
  getParkById,
  resolveCatalogParkId,
} from "@/lib/catalog-server";
import { getCommunityStatsById } from "@/lib/community-stats-server";
import { GUIDES, guidePath } from "@/lib/guides";
import { SITE_URL as BASE_URL } from "@/lib/site-url";
import { coasterSlug, parkSlug } from "@/lib/slug";

// On-demand only — sync revalidates after real catalog changes.
export const revalidate = false;
export const maxDuration = 60;

/** Stable within the UTC week so deploys don't fake mass catalog updates. */
function weekStartUtc(date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function staticRoutes(catalogStamp: Date): MetadataRoute.Sitemap {
  return [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/coaster-tracker", priority: 0.95, changeFrequency: "weekly" as const },
    { path: "/coaster-credits", priority: 0.95, changeFrequency: "weekly" as const },
    { path: "/guides", priority: 0.95, changeFrequency: "weekly" as const },
    { path: "/catalog", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/map", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/parks", priority: 0.85, changeFrequency: "weekly" as const },
    { path: "/coasters", priority: 0.85, changeFrequency: "weekly" as const },
    ...(CATALOG_DETAIL_CRAWLABLE
      ? [{ path: "/guess", priority: 0.75, changeFrequency: "weekly" as const }]
      : []),
    { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/updates", priority: 0.65, changeFrequency: "weekly" as const },
    { path: "/contact", priority: 0.5, changeFrequency: "yearly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  ].map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: catalogStamp,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

function guideRoutes(): MetadataRoute.Sitemap {
  return GUIDES.map((guide) => ({
    url: `${BASE_URL}${guidePath(guide.slug)}`,
    lastModified: new Date(guide.published + "T12:00:00Z"),
    changeFrequency: "monthly" as const,
    priority: 0.92,
  }));
}

type Named = { id: number; name: string };

/**
 * Catalog pages that pass the same indexing rule as their robots meta
 * (isCoasterCatalogSubstantial / isParkCatalogSubstantial): a hand-written note or public
 * member ratings. Only noted or rated records can pass, so those are the candidates; that
 * also lists a new note even for a ride outside the top-ranked sitemap picks.
 */
async function listIndexableCatalog(): Promise<{ parks: Named[]; coasters: Named[] }> {
  const communityStats = await getCommunityStatsById();

  const ratedIds = communityStats
    ? [...communityStats.values()].filter((s) => s.ratingCount != null).map((s) => s.coasterId)
    : [];
  const coasterIds = new Set([...Object.keys(COASTER_NOTES).map(Number), ...ratedIds]);

  const coasters = new Map<number, Named>();
  const parkIdsOfIndexedCoasters = new Set<number>();
  for (const id of coasterIds) {
    if (!isCoasterCatalogSubstantial({ id }, communityStats)) continue;
    const coaster = await getCoasterById(id);
    if (!coaster || coasters.has(coaster.id)) continue;
    coasters.set(coaster.id, { id: coaster.id, name: coaster.name });
    parkIdsOfIndexedCoasters.add(coaster.park_id);
  }

  // A park qualifies through its own note or one of its coasters, so no other park can pass.
  const parkIds = new Set([...Object.keys(PARK_NOTES).map(Number), ...parkIdsOfIndexedCoasters]);

  const parks = new Map<number, Named>();
  for (const id of parkIds) {
    const canonicalId = await resolveCatalogParkId(id);
    if (parks.has(canonicalId)) continue;
    const park = await getParkById(canonicalId);
    if (!park) continue;
    const rides = await getCoastersForPark(canonicalId);
    if (!isParkCatalogSubstantial(canonicalId, rides, communityStats)) continue;
    parks.set(canonicalId, { id: canonicalId, name: park.name });
  }

  return { parks: [...parks.values()], coasters: [...coasters.values()] };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalogStamp = weekStartUtc();
  const core = [...staticRoutes(catalogStamp), ...guideRoutes()];
  // robots.txt blocks catalog detail pages for now, so listing them would only send crawlers to blocked URLs.
  if (!CATALOG_DETAIL_CRAWLABLE) return core;

  try {
    // Public profiles are deliberately absent: the privacy policy says stats pages are not offered
    // to search engines, and /u/ pages carry noindex.
    const { parks, coasters } = await listIndexableCatalog();

    const parkRoutes: MetadataRoute.Sitemap = parks.map((park) => ({
      url: `${BASE_URL}/parks/${parkSlug(park.name, park.id)}`,
      lastModified: catalogStamp,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

    const coasterRoutes: MetadataRoute.Sitemap = coasters.map((coaster) => ({
      url: `${BASE_URL}/coasters/${coasterSlug(coaster.name, coaster.id)}`,
      lastModified: catalogStamp,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [...core, ...parkRoutes, ...coasterRoutes];
  } catch {
    // Catalog fetch can time out; still advertise the pages Google should crawl first.
    return core;
  }
}
