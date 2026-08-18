/** True when a Wikidata label fell back to the entity id (e.g. "Q2197655"). */
export function isWikidataQidLabel(value: string | null | undefined): boolean {
  return /^Q\d+$/i.test((value ?? "").trim());
}

/** Human-readable Wikidata label, or null when the service returned a bare Q-id. */
export function humanWikidataLabel(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  if (!t || isWikidataQidLabel(t)) return null;
  return t;
}
