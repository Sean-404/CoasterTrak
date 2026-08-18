/** Canonical origin with no trailing slash. Env often includes one. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com").replace(
  /\/+$/,
  "",
);
