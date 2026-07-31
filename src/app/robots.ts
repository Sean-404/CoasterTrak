import type { MetadataRoute } from "next";

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com").replace(/\/+$/, "");
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
