type WikipediaBackgroundProps = {
  extract: string;
  url: string;
  note?: string;
};

/** Attributed Wikipedia copy, never the primary article on a catalog page. */
export function WikipediaBackground({ extract, url, note }: WikipediaBackgroundProps) {
  return (
    <aside className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Background from Wikipedia
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{extract}</p>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Sourced from{" "}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-amber-700 hover:underline"
        >
          Wikipedia
        </a>
        . {note ?? "CoasterTrak catalog stats and operating status can differ from this summary."}
      </p>
    </aside>
  );
}
