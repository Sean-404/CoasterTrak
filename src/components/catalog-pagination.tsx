import Link from "next/link";
import { catalogHref } from "@/lib/catalog-pagination";

type Props = {
  path: string;
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  query?: string;
  country?: string;
  itemLabel: string;
};

export function CatalogPagination({
  path,
  page,
  totalPages,
  total,
  from,
  to,
  query = "",
  country = "",
  itemLabel,
}: Props) {
  if (total === 0 || totalPages <= 1) {
    if (total === 0) return null;
    return (
      <p className="mt-6 text-sm text-slate-500">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {itemLabel}
      </p>
    );
  }

  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  const windowPages = visiblePages(page, totalPages);
  const hrefOpts = { q: query, country };

  return (
    <nav
      className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Pagination"
    >
      <p className="text-sm text-slate-500">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {prev != null ? (
          <Link
            href={catalogHref(path, { ...hrefOpts, page: prev })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            rel="prev"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-300">
            Previous
          </span>
        )}

        {windowPages.map((entry, index) =>
          entry === "…" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-sm text-slate-400">
              …
            </span>
          ) : (
            <Link
              key={entry}
              href={catalogHref(path, { ...hrefOpts, page: entry })}
              aria-current={entry === page ? "page" : undefined}
              className={`min-w-9 rounded-lg px-2.5 py-1.5 text-center text-sm font-semibold transition ${
                entry === page
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {entry}
            </Link>
          ),
        )}

        {next != null ? (
          <Link
            href={catalogHref(path, { ...hrefOpts, page: next })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            rel="next"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-300">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

function visiblePages(page: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page]);
  for (let i = page - 1; i <= page + 1; i += 1) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }
  if (page <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (page >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}
