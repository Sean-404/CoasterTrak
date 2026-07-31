import type { MetadataRoute } from "next";
import { listCoastersForSitemap, listParksForSitemap } from "@/lib/catalog-server";
import { coasterSlug, parkSlug } from "@/lib/slug";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "/", priority: 1, changeFrequency: "daily" as const },
    { path: "/coaster-tracker", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/map", priority: 0.9, changeFrequency: "daily" as const },
    { path: "/parks", priority: 0.85, changeFrequency: "daily" as const },
    { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  ].map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const [parks, coasters] = await Promise.all([listParksForSitemap(), listCoastersForSitemap()]);

  const parkRoutes: MetadataRoute.Sitemap = parks.map((park) => ({
    url: `${BASE_URL}/parks/${parkSlug(park.name, park.id)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const coasterRoutes: MetadataRoute.Sitemap = coasters.map((coaster) => ({
    url: `${BASE_URL}/coasters/${coasterSlug(coaster.name, coaster.id)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...parkRoutes, ...coasterRoutes];
}
