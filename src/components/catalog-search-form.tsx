"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type CatalogSearchFormProps = {
  placeholder: string;
  /** Accessible label for the search input. */
  label: string;
  /** Initial query from the server (URL `q` param). */
  initialQuery?: string;
};

/**
 * Debounced catalog search that syncs to `?q=` without a full page jump.
 */
export function CatalogSearchForm({
  placeholder,
  label,
  initialQuery = "",
}: CatalogSearchFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = value.trim();
    const current = (searchParams.get("q") ?? "").trim();
    if (trimmed === current) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [value, pathname, router, searchParams]);

  return (
    <div className="mt-6">
      <label className="sr-only" htmlFor="catalog-search">
        {label}
      </label>
      <div className="relative">
        <input
          id="catalog-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-20 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {isPending ? (
            <span className="px-1 text-xs text-slate-400" aria-live="polite">
              Searching…
            </span>
          ) : null}
          {value.trim() ? (
            <button
              type="button"
              onClick={() => setValue("")}
              className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
