/**
 * Hand-written CoasterTrak notes for catalog pages, keyed by catalog id
 * (the number at the end of the page URL, e.g. /coasters/velocicoaster-1416 → 1416).
 *
 * A note is what makes a park or coaster page worth indexing, so it must be original:
 * first-hand opinion, tips or context written for CoasterTrak. Never copy or reword
 * Wikipedia, RCDB or park websites. Separate paragraphs with a blank line.
 * catalog-notes.test.ts rejects notes under MIN_NOTE_WORDS words.
 */
export const MIN_NOTE_WORDS = 50;

/** Coaster notes by coaster id. */
export const COASTER_NOTES: Readonly<Record<number, string>> = {};

/** Park notes by canonical park id. */
export const PARK_NOTES: Readonly<Record<number, string>> = {};

function noteFrom(registry: Readonly<Record<number, string>>, id: number): string | null {
  const note = registry[id]?.trim();
  return note ? note : null;
}

export function coasterNote(coasterId: number): string | null {
  return noteFrom(COASTER_NOTES, coasterId);
}

export function parkNote(parkId: number): string | null {
  return noteFrom(PARK_NOTES, parkId);
}

/** Note text split into paragraphs on blank lines. */
export function noteParagraphs(note: string): string[] {
  return note
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function noteWordCount(note: string): number {
  return note.trim().split(/\s+/).filter(Boolean).length;
}
