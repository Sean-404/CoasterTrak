import type { MetadataRoute } from "next";
import { SITE_URL as BASE_URL } from "@/lib/site-url";

const ROBOTS_HOST = (() => {
  try {
    return new URL(BASE_URL).host;
  } catch {
    return "coastertrak.com";
  }
})();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/api/", "/login", "/wishlist", "/stats", "/friends", "/achievements"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: ROBOTS_HOST,
  };
}
