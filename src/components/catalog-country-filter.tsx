"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type CatalogCountryFilterProps = {
  countries: string[];
  /** Current country from the URL (`country` param). Empty = all. */
  initialCountry?: string;
};

/**
 * Country filter for /parks. Syncs to `?country=` and clears `page`.
 * Preserves the text search `q` param.
 */
export function CatalogCountryFilter({
  countries,
  initialCountry = "",
}: CatalogCountryFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const selected = (searchParams.get("country") ?? initialCountry).trim();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("country", next);
    else params.delete("country");
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-700 sm:w-56">
      <span className="font-medium">Country</span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        aria-label="Filter parks by country"
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:opacity-70"
      >
        <option value="">All countries</option>
        {countries.map((country) => (
          <option key={country} value={country}>
            {country}
          </option>
        ))}
      </select>
    </label>
  );
}
