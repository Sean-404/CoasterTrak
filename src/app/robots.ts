import type { MetadataRoute } from "next";
import { CATALOG_DETAIL_CRAWLABLE, CATALOG_DETAIL_ROBOTS_DISALLOW } from "@/lib/catalog-content";
import { listParksWithOriginalContent } from "@/lib/park-reviews-server";
import { SITE_URL as BASE_URL } from "@/lib/site-url";
import { parkSlug } from "@/lib/slug";

// Moderation revalidates /robots.txt when a park gains or loses its third approved review.
export const revalidate = 86400;

const ROBOTS_HOST = (() => {
  try {
    return new URL(BASE_URL).host;
  } catch {
    return "coastertrak.com";
  }
})();

/**
 * While catalog pages are blocked, park pages with original content (a note or enough
 * approved member reviews) are allowed back in by exact path. Crawlers follow the most
 * specific rule, so each Allow beats the broader Disallow: /parks/.
 */
async function reopenedParkPaths(): Promise<string[]> {
  if (CATALOG_DETAIL_CRAWLABLE) return [];
  try {
    const parks = await listParksWithOriginalContent();
    // "$" ends the match, so the rule opens that one page and nothing that merely starts with it.
    return parks.map((park) => `/parks/${parkSlug(park.name, park.id)}$`);
  } catch {
    return [];
  }
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const reopened = await reopenedParkPaths();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", ...reopened],
        disallow: [
          "/admin",
          "/account",
          "/api/",
          "/login",
          "/reset-password",
          "/wishlist",
          "/stats",
          "/friends",
          "/users",
          "/achievements",
          ...(CATALOG_DETAIL_CRAWLABLE ? [] : CATALOG_DETAIL_ROBOTS_DISALLOW),
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: ROBOTS_HOST,
  };
}
