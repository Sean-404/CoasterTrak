import type { MetadataRoute } from "next";
import { listCoastersForSitemap, listParksForSitemap } from "@/lib/catalog-server";
import { coasterSlug, parkSlug } from "@/lib/slug";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com";

export const revalidate = 86400;
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
    { path: "/map", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/parks", priority: 0.85, changeFrequency: "weekly" as const },
    { path: "/coasters", priority: 0.85, changeFrequency: "weekly" as const },
    { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  ].map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: catalogStamp,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalogStamp = weekStartUtc();
  const core = staticRoutes(catalogStamp);

  try {
    const [parks, coasters] = await Promise.all([listParksForSitemap(), listCoastersForSitemap()]);

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
