"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { sampleCoasters, sampleParks } from "@/lib/sample-data";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Coaster, Park } from "@/types/domain";
import { useUnits } from "@/components/providers";
import { UnitsToggle } from "@/components/units-toggle";

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

/** Queue-Times once shipped Epic Universe with +81°E instead of -81°W; fix display until DB sync overwrites. */
function fixUsParkLongitude(p: Park): Park {
  const lat = p.latitude ?? 0;
  const lng = p.longitude ?? 0;
  const country = (p.country ?? "").toLowerCase();
  if (country.includes("united states") && lng > 0 && lat >= 22 && lat <= 50) {
    return { ...p, longitude: -lng };
  }
  return p;
}

function getContinent(lat: number, lng: number): Continent {
  if (lat > 15 && lat < 72 && lng > -168 && lng < -52) return "North America";
  if (lat > -56 && lat < 15 && lng > -82 && lng < -34) return "South America";
  // Europe before Asia so Turkey/western Russia stay in Europe
  if (lat > 34 && lat < 72 && lng > -25 && lng < 40) return "Europe";
  if (lat > -47 && lat < -10 && lng > 110 && lng < 180) return "Oceania";
  // Arabian Peninsula + Gulf — classify as Asia (not Africa). Must run before Africa bbox.
  if (lat > 12 && lat < 33 && lng > 34 && lng < 62) return "Asia";
  // Africa (Egypt through Maghreb + sub-Saharan). lng < 52 keeps Horn of Africa in Africa.
  if (lat > -35 && lat < 38 && lng > -18 && lng < 52) return "Africa";
  // Remaining eastern hemisphere: central Asia, India, Russia east of Europe, etc.
  if (lat > -10 && lat < 77 && lng > 25 && lng < 180) return "Asia";
  return "All";
}

export default function MapPage() {
  const [parks, setParks] = useState<Park[]>(sampleParks);
  const [coasters, setCoasters] = useState<Coaster[]>(sampleCoasters);
  const [queueTimesByParkId, setQueueTimesByParkId] = useState<Record<number, QueueRide[]>>({});
  const [continent, setContinent] = useState<Continent>("All");
  const [search, setSearch] = useState("");
  const { units, setUnits } = useUnits();


  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    Promise.all([supabase.from("parks").select("*"), supabase.from("coasters").select("*")]).then(([parksRes, coastersRes]) => {
      if (!parksRes.error && parksRes.data?.length) setParks(parksRes.data.map(fixUsParkLongitude));
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

  // Merge duplicate parks from different sync sources (Kaggle vs Queue-Times).
  // Two parks are considered the same if they share an exact name OR are within 2 km of each
  // other (handles cases like "Alton" vs "Alton Towers" at the same location).
  // The merged entry keeps the queue_times_park_id and coordinates from whichever has them.
  const deduplicatedParks = useMemo(() => {
    const canonical = new Map<number, Park>(); // canonical id → merged park
    const idRemap = new Map<number, number>(); // duplicate id → canonical id

    function distanceKm(a: Park, b: Park) {
      if (!a.latitude || !b.latitude) return Infinity;
      const dlat = (b.latitude - a.latitude) * 111;
      const dlng = (b.longitude - a.longitude) * 111 * Math.cos((a.latitude * Math.PI) / 180);
      return Math.sqrt(dlat * dlat + dlng * dlng);
    }

    function mergeInto(base: Park, duplicate: Park) {
      idRemap.set(duplicate.id, base.id);
      if (!base.queue_times_park_id && duplicate.queue_times_park_id) {
        base.queue_times_park_id = duplicate.queue_times_park_id;
        base.latitude = duplicate.latitude;
        base.longitude = duplicate.longitude;
      }
      // Use the longer/more descriptive name (e.g. "Alton Towers" over "Alton")
      if (duplicate.name.length > base.name.length && !base.queue_times_park_id) {
        base.name = duplicate.name;
      }
    }

    for (const park of parks) {
      if (idRemap.has(park.id)) continue;

      canonical.set(park.id, { ...park });

      for (const [, existing] of canonical) {
        if (existing.id === park.id) continue;
        if (idRemap.has(existing.id)) continue;

        const sameName = existing.name.toLowerCase().trim() === park.name.toLowerCase().trim();
        const dist = distanceKm(existing, park);
        // Only merge identical names when parks are in the same region (~200 km).
        // Otherwise two parks worldwide sharing a name (e.g. "Epic Universe" vs a bad row)
        // get merged and coordinates / queue IDs get corrupted.
        const sameNameNearby = sameName && dist < 200;
        const veryClose = dist < 2;

        if (sameNameNearby || veryClose) {
          mergeInto(existing, park);
          canonical.delete(park.id);
          break;
        }
      }
    }

    return { parks: Array.from(canonical.values()), idRemap };
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
        <div className="mb-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by park or coaster…"
              aria-label="Search by park or coaster"
              className="w-full rounded border border-slate-300 px-3 py-2 sm:w-80"
            />
            <div className="ml-auto shrink-0">
              <UnitsToggle units={units} onChange={setUnits} />
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {CONTINENTS.map((c) => (
              <button
                key={c}
                onClick={() => setContinent(c)}
                aria-pressed={continent === c}
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
        <ParkMap parks={filteredParks} coasters={remappedCoasters} queueTimesByParkId={queueTimesByParkId} units={units} continent={continent} />
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
