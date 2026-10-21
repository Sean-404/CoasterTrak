import Link from "next/link";
import type { SourceLink } from "@/lib/catalog-sources";

type CatalogSourcesPanelProps = {
  /** Per-record sources (coaster pages). */
  sources?: SourceLink[];
  /** Plain-language coverage lines (park pages), e.g. "Status confirmed for 15 of 25 rides". */
  coverage?: string[];
  /** Fields we do not have yet; shown so readers know what is missing rather than guessing. */
  missing?: string[];
  reportHref: string;
};

/** Where a catalog record came from, what it lacks, and how to correct it. */
export function CatalogSourcesPanel({ sources, coverage, missing, reportHref }: CatalogSourcesPanelProps) {
  return (
    <section
      aria-labelledby="catalog-sources-heading"
      className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 id="catalog-sources-heading" className="text-base font-semibold text-slate-900">
        Sources &amp; corrections
      </h2>

      {sources && sources.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {sources.map((source) => (
            <li key={source.href}>
              <a
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-700 underline-offset-2 hover:underline"
              >
                {source.label}
              </a>
              <span className="text-slate-500"> — {source.detail}</span>
            </li>
          ))}
        </ul>
      ) : sources ? (
        <p className="mt-3 text-sm text-slate-600">
          This record is not linked to a Wikidata item yet, so its details have not been cross-checked.
        </p>
      ) : null}

      {coverage && coverage.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {coverage.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {missing && missing.length > 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Not in our sources yet:</span> {missing.join(", ")}.
        </p>
      ) : null}

      <p className="mt-4 text-sm text-slate-600">
        Spotted a mistake or know a missing detail?{" "}
        <a href={reportHref} className="font-semibold text-amber-700 underline-offset-2 hover:underline">
          Send a correction
        </a>{" "}
        with a source we can check. How records are built:{" "}
        <Link href="/catalog" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
          how the catalog works
        </Link>
        .
      </p>
    </section>
  );
}
