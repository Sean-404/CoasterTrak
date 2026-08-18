/** Default Discover landing page. Parks and coasters stay on their own SEO URLs. */
export const DISCOVER_HREF = "/map";

export function isDiscoverPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === "/map" ||
    pathname === "/discover" ||
    pathname.startsWith("/parks") ||
    pathname.startsWith("/coasters")
  );
}
