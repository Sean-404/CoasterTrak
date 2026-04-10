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

const CONTINENTS = ["All", "North America", "South America", "Europe", "Asia", "Oceania", "Africa"] as const;
type Continent = (typeof CONTINENTS)[number];

function getContinent(lat: number, lng: number): Continent {
  if (lat > 15 && lat < 72 && lng > -168 && lng < -52) return "North America";
  if (lat > -56 && lat < 15 && lng > -82 && lng < -34) return "South America";
  if (lat > 34 && lat < 72 && lng > -25 && lng < 40) return "Europe";
  if (lat > -35 && lat < 37 && lng > -18 && lng < 52) return "Africa";
  if (lat > -47 && lat < -10 && lng > 110 && lng < 180) return "Oceania";
  if (lat > -10 && lat < 77 && lng > 25 && lng < 180) return "Asia";
  return "Europe";
}

export default function MapPage() {
  const [parks, setParks] = useState<Park[]>(sampleParks);
  const [coasters, setCoasters] = useState<Coaster[]>(sampleCoasters);
  const [queueTimesByParkId, setQueueTimesByParkId] = useState<Record<number, QueueRide[]>>({});
  const [continent, setContinent] = useState<Continent>("All");
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

  // Merge duplicate parks that share the same name (different sync sources produce separate rows).
  // The merged park keeps the queue_times_park_id from whichever entry has one, and adopts
  // coordinates from that same entry (Queue-Times coords tend to be more accurate).
  const deduplicatedParks = useMemo(() => {
    const byName = new Map<string, Park>();
    const idRemap = new Map<number, number>();

    for (const park of parks) {
      const key = park.name.toLowerCase().trim();
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { ...park });
      } else {
        idRemap.set(park.id, existing.id);
        if (!existing.queue_times_park_id && park.queue_times_park_id) {
          existing.queue_times_park_id = park.queue_times_park_id;
          existing.latitude = park.latitude;
          existing.longitude = park.longitude;
        }
      }
    }

    return { parks: Array.from(byName.values()), idRemap };
  }, [parks]);

  const remappedCoasters = useMemo(() => {
    const { idRemap } = deduplicatedParks;
    if (!idRemap.size) return coasters;
    return coasters.map((c) => {
      const canonical = idRemap.get(c.park_id);
      return canonical ? { ...c, park_id: canonical } : c;
    });
  }, [coasters, deduplicatedParks]);

  const filteredParks = useMemo(() => {
    const term = search.toLowerCase();
    return deduplicatedParks.parks.filter((park) => {
      if (park.latitude === 0 && park.longitude === 0) return false;
      const byContinent = continent === "All" || getContinent(park.latitude, park.longitude) === continent;
      const coasterNames = remappedCoasters
        .filter((c) => c.park_id === park.id)
        .map((c) => c.name.toLowerCase())
        .join(" ");
      const bySearch = !term || park.name.toLowerCase().includes(term) || coasterNames.includes(term);
      return byContinent && bySearch;
    });
  }, [continent, search, deduplicatedParks, remappedCoasters]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Coaster map</h1>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by park or coaster…"
            className="w-full rounded border border-slate-300 px-3 py-2 sm:w-80"
          />
          <div className="flex gap-1 flex-wrap">
            {CONTINENTS.map((c) => (
              <button
                key={c}
                onClick={() => setContinent(c)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  continent === c
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-600 hover:border-slate-500"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <ParkMap parks={filteredParks} coasters={remappedCoasters} queueTimesByParkId={queueTimesByParkId} />
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
