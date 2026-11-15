import Link from "next/link";
import { Fragment } from "react";
import type { SourceLink } from "@/lib/catalog-sources";

type CatalogSourcesPanelProps = {
  /** Where the record came from. Each link's detail shows as a tooltip. */
  sources: SourceLink[];
  /** Short travel caveat, e.g. "Details may be out of date. Check with the park before you travel." */
  note: string;
  reportHref: string;
};

const LINK = "font-medium text-amber-700 underline-offset-2 hover:underline";

/** Credits a catalog record's sources and offers a way to report a mistake, in two lines. */
export function CatalogSourcesPanel({ sources, note, reportHref }: CatalogSourcesPanelProps) {
  return (
    <section aria-label="Sources and corrections" className="mt-10 border-t border-slate-200 pt-5 text-sm text-slate-600">
      <p>
        <span className="font-medium text-slate-700">Sources:</span>{" "}
        {sources.length > 0 ? (
          sources.map((source, i) => (
            <Fragment key={source.href}>
              {i > 0 ? <span aria-hidden> · </span> : null}
              <a href={source.href} target="_blank" rel="noopener noreferrer" title={source.detail} className={LINK}>
                {source.label}
              </a>
            </Fragment>
          ))
        ) : (
          <>not yet cross-checked against Wikidata.</>
        )}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
        {note}{" "}
        <a href={reportHref} className={LINK}>
          Report a mistake
        </a>
        <span aria-hidden> · </span>
        <Link href="/catalog" className={LINK}>
          How the catalog works
        </Link>
      </p>
    </section>
  );
}
