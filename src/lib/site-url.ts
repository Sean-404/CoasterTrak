/** Canonical origin with no trailing slash. Env often includes one. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com").replace(
  /\/+$/,
  "",
);

/** Auth emails and recovery links always land on the public domain, never a Vercel preview. */
export const AUTH_ORIGIN = "https://coastertrak.com";

export const CONTACT_EMAIL = "hello@coastertrak.com";
export const INSTAGRAM_URL = "https://www.instagram.com/coastertrak/";
/** Ko-fi tip page, e.g. "https://ko-fi.com/yourname". Tip links stay hidden while this is null. */
export const KOFI_URL: string | null = "https://ko-fi.com/coastertrak";

/**
 * Default link preview image. A page that sets `openGraph` replaces the whole block from the root
 * layout, so each one has to list this itself or it shares with no image.
 */
export const SOCIAL_IMAGE = {
  url: "/coaster-hero.jpg",
  width: 1376,
  height: 768,
  alt: "CoasterTrak: free coaster credit tracker",
};

export const PASSWORD_RESET_PATH = "/reset-password";

export function siteHref(path: string, origin: string = SITE_URL): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

export const PASSWORD_RESET_HREF = siteHref(PASSWORD_RESET_PATH, AUTH_ORIGIN);
