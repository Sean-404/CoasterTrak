/**
 * RCDB identifiers from Wikidata P2751 (https://www.wikidata.org/wiki/Property:P2751).
 * IDs + outbound deep-links only — we do not fetch or import RCDB stats/content.
 */

const RCDB_ID_RE = /^[1-9]\d*$/;

/** Normalize a Wikidata / export RCDB id to digits-only, or null if invalid. */
export function normalizeRcdbId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/rcdb\.com\/([1-9]\d*)\.htm/i)?.[1];
  const digits = (fromUrl ?? trimmed).replace(/\D/g, "");
  if (!digits || !RCDB_ID_RE.test(digits)) return null;
  return digits;
}

export function rcdbCoasterUrl(rcdbId: string | null | undefined): string | null {
  const id = normalizeRcdbId(rcdbId);
  if (!id) return null;
  return `https://rcdb.com/${id}.htm`;
}
