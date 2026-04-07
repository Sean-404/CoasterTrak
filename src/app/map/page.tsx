"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { sampleCoasters, sampleParks } from "@/lib/sample-data";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Coaster, Park } from "@/types/domain";

const ParkMap = dynamic(() => import("@/components/park-map").then((m) => m.ParkMap), { ssr: false });

export default function MapPage() {
  const [parks, setParks] = useState<Park[]>(sampleParks);
  const [coasters, setCoasters] = useState<Coaster[]>(sampleCoasters);
  const [country, setCountry] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    Promise.all([supabase.from("parks").select("*"), supabase.from("coasters").select("*")]).then(([parksRes, coastersRes]) => {
      if (!parksRes.error && parksRes.data?.length) setParks(parksRes.data);
      if (!coastersRes.error && coastersRes.data?.length) setCoasters(coastersRes.data);
    });
  }, []);

  const countries = useMemo(() => ["All", ...new Set(parks.map((p) => p.country))], [parks]);

  const filteredParks = useMemo(() => {
    const term = search.toLowerCase();
    return parks.filter((park) => {
      const byCountry = country === "All" || park.country === country;
      const coasterNames = coasters
        .filter((c) => c.park_id === park.id)
        .map((c) => c.name.toLowerCase())
        .join(" ");
      const bySearch = !term || park.name.toLowerCase().includes(term) || coasterNames.includes(term);
      return byCountry && bySearch;
    });
  }, [country, search, parks, coasters]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Coaster map</h1>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by park or coaster..."
            className="w-full rounded border border-slate-300 px-3 py-2 sm:w-80"
          />
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded border border-slate-300 px-3 py-2">
            {countries.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <ParkMap parks={filteredParks} coasters={coasters} />
      </main>
    </div>
  );
}
