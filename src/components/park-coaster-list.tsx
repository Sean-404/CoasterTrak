"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Coaster } from "@/types/domain";
import { ParkCoasterRow } from "@/components/park-coaster-row";
import {
  filterAndSortCoasters,
  type CoasterSortKey,
  type CoasterStatusFilter,
  isCoasterDefunct,
  uniqueCoasterTypes,
} from "@/lib/catalog-coaster-sort";

type Props = {
  coasters: Coaster[];
  parkName?: string;
  parkCountry?: string;
  /** When set, only these coaster IDs get followable links (sitemap-eligible rides). */
  crawlFollowIds?: number[];
};

export function ParkCoasterList({ coasters, parkName, parkCountry, crawlFollowIds }: Props) {
  const [sort, setSort] = useState<CoasterSortKey>("name");
  const [statusFilter, setStatusFilter] = useState<CoasterStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const types = useMemo(() => uniqueCoasterTypes(coasters), [coasters]);
  const operatingCount = useMemo(
    () => coasters.filter((c) => !isCoasterDefunct(c)).length,
    [coasters],
  );
  const defunctCount = coasters.length - operatingCount;
  const crawlFollowSet = useMemo(
    () => (crawlFollowIds ? new Set(crawlFollowIds) : null),
    [crawlFollowIds],
  );

  const visible = useMemo(
    () => filterAndSortCoasters(coasters, { sort, statusFilter, typeFilter }),
    [coasters, sort, statusFilter, typeFilter],
  );

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {parkName ? `Roller coasters at ${parkName}` : "Roller coasters"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {visible.length} of {coasters.length} shown
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-slate-700 sm:w-44">
          <span className="font-medium">Sort by</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CoasterSortKey)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            aria-label="Sort coasters"
          >
            <option value="name">Name (A–Z, defunct last)</option>
            <option value="speed">Speed (fastest)</option>
            <option value="height">Height (tallest)</option>
            <option value="type">Type</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterPill
          active={statusFilter === "all" && typeFilter == null}
          onClick={() => {
            setStatusFilter("all");
            setTypeFilter(null);
          }}
        >
          All ({coasters.length})
        </FilterPill>
        {operatingCount > 0 ? (
          <FilterPill
            active={statusFilter === "operating" && typeFilter == null}
            onClick={() => {
              setStatusFilter("operating");
              setTypeFilter(null);
            }}
          >
            Operating ({operatingCount})
          </FilterPill>
        ) : null}
        {defunctCount > 0 ? (
          <FilterPill
            active={statusFilter === "defunct" && typeFilter == null}
            onClick={() => {
              setStatusFilter("defunct");
              setTypeFilter(null);
            }}
            tone="red"
          >
            Defunct ({defunctCount})
          </FilterPill>
        ) : null}
        {types.map((type) => (
          <FilterPill
            key={type}
            active={typeFilter === type.toLowerCase()}
            onClick={() => {
              setStatusFilter("all");
              setTypeFilter(typeFilter === type.toLowerCase() ? null : type.toLowerCase());
            }}
          >
            {type}
          </FilterPill>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No coasters match the current filters.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {visible.map((coaster) => (
            <ParkCoasterRow
              key={coaster.id}
              coaster={coaster}
              parkName={parkName}
              parkCountry={parkCountry}
              nofollow={crawlFollowSet != null && !crawlFollowSet.has(coaster.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilterPill({
  children,
  active,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "red";
}) {
  const base =
    tone === "red"
      ? active
        ? "border-red-300 bg-red-100 text-red-800"
        : "border-red-200 bg-white text-red-700 hover:bg-red-50"
      : active
        ? "border-amber-300 bg-amber-100 text-amber-900"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${base}`}
    >
      {children}
    </button>
  );
}
