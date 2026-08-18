/** Canonical origin with no trailing slash. Env often includes one. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com").replace(
  /\/+$/,
  "",
);

export const CONTACT_EMAIL = "hello@coastertrak.com";
export const INSTAGRAM_URL = "https://www.instagram.com/coastertrak/";
