"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { sampleCoasters, sampleParks } from "@/lib/sample-data";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Coaster, Park } from "@/types/domain";

const ParkMap = dynamic(() => import("@/components/park-map").then((m) => m.ParkMap), { ssr: false });

type QueueRide = {
  id: number;
  name: string;
  isOpen: boolean;
  waitTime: number;
  lastUpdated: string;
};

export default function MapPage() {
  const [parks, setParks] = useState<Park[]>(sampleParks);
  const [coasters, setCoasters] = useState<Coaster[]>(sampleCoasters);
  const [queueTimesByParkId, setQueueTimesByParkId] = useState<Record<number, QueueRide[]>>({});
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

  useEffect(() => {
    const queueTimesParkIds = [...new Set(parks.map((park) => park.queue_times_park_id).filter((id): id is number => Number.isFinite(id)))];
    if (!queueTimesParkIds.length) return;

    Promise.all(
      queueTimesParkIds.map(async (queueParkId) => {
        const response = await fetch(`/api/queue-times/${queueParkId}`);
        if (!response.ok) return [queueParkId, []] as const;
        const data = (await response.json()) as { rides?: QueueRide[] };
        return [queueParkId, data.rides ?? []] as const;
      }),
    ).then((entries) => {
      setQueueTimesByParkId(Object.fromEntries(entries));
    });
  }, [parks]);

  const countries = useMemo(() => ["All", ...new Set(parks.map((p) => p.country))], [parks]);

  const filteredParks = useMemo(() => {
    const term = search.toLowerCase();
    return parks.filter((park) => {
      if (park.latitude === 0 && park.longitude === 0) return false;
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
        <ParkMap parks={filteredParks} coasters={coasters} queueTimesByParkId={queueTimesByParkId} />
        <p className="mt-3 text-xs text-slate-500">
          Queue data powered by{" "}
          <a className="underline" href="https://queue-times.com/" target="_blank" rel="noreferrer">
            Queue-Times.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
