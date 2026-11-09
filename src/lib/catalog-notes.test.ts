import { describe, expect, it } from "vitest";
import {
  COASTER_NOTES,
  MIN_NOTE_WORDS,
  PARK_NOTES,
  coasterNote,
  noteParagraphs,
  noteWordCount,
} from "@/lib/catalog-notes";

describe("catalog notes", () => {
  const all = [
    ...Object.entries(COASTER_NOTES).map(([id, note]) => ({ kind: "coaster", id, note })),
    ...Object.entries(PARK_NOTES).map(([id, note]) => ({ kind: "park", id, note })),
  ];

  it("only holds notes long enough to be worth indexing", () => {
    const short = all.filter(({ note }) => noteWordCount(note) < MIN_NOTE_WORDS).map((n) => `${n.kind} ${n.id}`);
    expect(short).toEqual([]);
  });

  it("keys notes by positive integer ids", () => {
    for (const { id } of all) {
      expect(Number.isInteger(Number(id)) && Number(id) > 0).toBe(true);
    }
  });

  it("returns null for ids without a note", () => {
    expect(coasterNote(-1)).toBeNull();
  });

  it("splits paragraphs on blank lines and collapses wrapped lines", () => {
    expect(noteParagraphs("First line\nwrapped.\n\n  Second paragraph.  \n")).toEqual([
      "First line wrapped.",
      "Second paragraph.",
    ]);
  });
});
