import { noteParagraphs } from "@/lib/catalog-notes";

/** A hand-written note from catalog-notes.ts, the original part of a catalog page. */
export function CatalogNote({ note }: { note: string }) {
  return (
    <section
      aria-labelledby="catalog-note-heading"
      className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"
    >
      <h2 id="catalog-note-heading" className="text-base font-semibold text-slate-900">
        CoasterTrak&apos;s take
      </h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-slate-700">
        {noteParagraphs(note).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
