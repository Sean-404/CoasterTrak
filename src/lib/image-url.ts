/** List thumbs are ~40px CSS; 96px is enough for 2x screens. */
export const LIST_THUMB_WIDTH = 96;

/**
 * Ask known CDNs for a small derivative so ride lists don't decode full-size photos.
 * Unknown hosts are returned unchanged.
 */
export function compactImageUrl(
  url: string | null | undefined,
  width = LIST_THUMB_WIDTH,
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || width < 16) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (/commons\.wikimedia\.org$/i.test(parsed.hostname) && /\/wiki\/Special:FilePath\//i.test(parsed.pathname)) {
      parsed.searchParams.set("width", String(width));
      return parsed.toString();
    }
    if (/upload\.wikimedia\.org$/i.test(parsed.hostname)) {
      const next = parsed.pathname.replace(/\/\d+px-/i, `/${width}px-`);
      if (next !== parsed.pathname) {
        parsed.pathname = next;
        return parsed.toString();
      }
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}
