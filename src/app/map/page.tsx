"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Coaster, Park } from "@/types/domain";
import { matchesSearchQuery } from "@/lib/display";
import { reconcileCountryWithCoords } from "@/lib/geo-country";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import {
  absorbReverseGeocodeParks,
  parkNamesMatch,
  snapOrphanCoastersToDisplayParks,
} from "@/lib/park-match";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";
import { useUnits } from "@/components/providers";
import { UnitsToggle } from "@/components/units-toggle";
import { isThrillCoaster } from "@/lib/coaster-dedup";

const ParkMap = dynamic(() => import("@/components/park-map").then((m) => m.ParkMap), { ssr: false });

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
  const [parks, setParks] = useState<Park[]>([]);
  const [coasters, setCoasters] = useState<Coaster[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [continent, setContinent] = useState<Continent>("All");
  const [search, setSearch] = useState("");
  const [includeFamilyRides, setIncludeFamilyRides] = useState(false);
  const { units, setUnits } = useUnits();


  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setCatalogLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [parksRes, coastersRes] = await Promise.all([
          fetchAllPages<Park>(SUPABASE_PAGE_SIZE, (from, to) =>
            supabase.from("parks").select("*").order("id", { ascending: true }).range(from, to),
          ),
          fetchAllPages<Coaster>(SUPABASE_PAGE_SIZE, (from, to) =>
            supabase.from("coasters").select("*").order("id", { ascending: true }).range(from, to),
          ),
        ]);
        if (cancelled) return;
        if (!parksRes.error && parksRes.data.length) setParks(parksRes.data.map(fixUsParkLongitude));
        if (!coastersRes.error && coastersRes.data.length) {
          setCoasters(coastersRes.data.map(applyCoasterKnownFixes));
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Wikidata sometimes creates a park row named like "Alton, Staffordshire, England" from a
  // centroid — wrong pin next to "Alton Towers". Merge into the real resort and remap coasters.
  const geoAbsorb = useMemo(() => absorbReverseGeocodeParks(parks), [parks]);

  // Merge duplicate parks from different sync sources (e.g. centroid vs resort name).
  // Exact same name: allow a wide radius (bad coords / different geocoders).
  // Fuzzy name match: allow a moderate radius — Wikidata/OSM vs other geocoders can differ by km.
  const deduplicatedParks = useMemo(() => {
    const canonical = new Map<number, Park>(); // canonical id → merged park
    const idRemap = new Map<number, number>(); // duplicate id → canonical id

    function distanceKm(a: Park, b: Park) {
      if (
        a.latitude == null ||
        b.latitude == null ||
        a.longitude == null ||
        b.longitude == null ||
        !Number.isFinite(a.latitude) ||
        !Number.isFinite(b.latitude) ||
        !Number.isFinite(a.longitude) ||
        !Number.isFinite(b.longitude)
      ) {
        return Infinity;
      }
      const dlat = (b.latitude - a.latitude) * 111;
      const dlng = (b.longitude - a.longitude) * 111 * Math.cos((a.latitude * Math.PI) / 180);
      return Math.sqrt(dlat * dlat + dlng * dlng);
    }

    function mergeInto(base: Park, duplicate: Park) {
      idRemap.set(duplicate.id, base.id);
      if (duplicate.name.length > base.name.length) {
        base.name = duplicate.name;
      }
      base.latitude = duplicate.latitude ?? base.latitude;
      base.longitude = duplicate.longitude ?? base.longitude;
      const lat = base.latitude ?? null;
      const lng = base.longitude ?? null;
      base.country = reconcileCountryWithCoords(base.country ?? duplicate.country, lat, lng);
    }

    for (const park of geoAbsorb.parks) {
      if (idRemap.has(park.id)) continue;

      canonical.set(park.id, { ...park });

      for (const [, existing] of canonical) {
        if (existing.id === park.id) continue;
        if (idRemap.has(existing.id)) continue;

        const sameName =
          existing.name.toLowerCase().trim() === park.name.toLowerCase().trim();
        const fuzzyName = parkNamesMatch(existing.name, park.name);
        const dist = distanceKm(existing, park);
        const sameNameNearby = sameName && dist < 200;
        const fuzzyNameNearby = fuzzyName && !sameName && dist < 40;

        if (sameNameNearby || fuzzyNameNearby) {
          mergeInto(existing, park);
          canonical.delete(park.id);
          break;
        }
      }
    }

    return { parks: Array.from(canonical.values()), idRemap };
  }, [geoAbsorb.parks]);

  const rawParkById = useMemo(() => new Map(parks.map((p) => [p.id, p])), [parks]);
  const dedupedParkById = useMemo(
    () => new Map(deduplicatedParks.parks.map((p) => [p.id, p])),
    [deduplicatedParks.parks],
  );

  const remappedCoasters = useMemo(() => {
    const geo = geoAbsorb.idRemap;
    const dedupe = deduplicatedParks.idRemap;
    const afterRemap = coasters.map((c) => {
      let pid = c.park_id;
      const g = geo.get(pid);
      if (g !== undefined) pid = g;
      const d = dedupe.get(pid);
      if (d !== undefined) pid = d;
      return pid !== c.park_id ? { ...c, park_id: pid } : c;
    });
    // If a coaster still references a removed geocode row, snap to nearest visible pin by distance.
    return snapOrphanCoastersToDisplayParks(afterRemap, deduplicatedParks.parks, rawParkById);
  }, [
    coasters,
    geoAbsorb.idRemap,
    deduplicatedParks.idRemap,
    deduplicatedParks.parks,
    rawParkById,
  ]);

  const visibleCoasters = useMemo(() => {
    if (includeFamilyRides) return remappedCoasters;
    return remappedCoasters.filter((c) => {
      const parkName = dedupedParkById.get(c.park_id)?.name ?? null;
      return isThrillCoaster(c, parkName);
    });
  }, [includeFamilyRides, remappedCoasters, dedupedParkById]);

  const visibleParkIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of visibleCoasters) ids.add(c.park_id);
    return ids;
  }, [visibleCoasters]);

  const filteredParks = useMemo(() => {
    return deduplicatedParks.parks.filter((park) => {
      if (
        park.latitude == null ||
        park.longitude == null ||
        !Number.isFinite(park.latitude) ||
        !Number.isFinite(park.longitude)
      ) {
        return false;
      }
      if (park.latitude === 0 && park.longitude === 0) return false;
      if (!visibleParkIds.has(park.id)) return false;
      const byContinent = continent === "All" || getContinent(park.latitude, park.longitude) === continent;
      const bySearch =
        matchesSearchQuery(park.name, search) ||
        visibleCoasters
          .filter((c) => c.park_id === park.id)
          .some((c) => matchesSearchQuery(c.name, search));
      return byContinent && bySearch;
    });
  }, [continent, search, deduplicatedParks, visibleCoasters, visibleParkIds]);

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
          <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeFamilyRides}
              onChange={(e) => setIncludeFamilyRides(e.target.checked)}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-400"
            />
            Include kiddie / family-style rides
          </label>
        </div>
        {catalogLoading && (
          <p className="mb-2 text-sm text-slate-500" role="status">
            Loading catalog&hellip;
          </p>
        )}
        {!catalogLoading && deduplicatedParks.parks.length === 0 && (
          <p className="mb-2 text-sm text-slate-600">No parks in the catalog yet.</p>
        )}
        <ParkMap parks={filteredParks} coasters={visibleCoasters} units={units} continent={continent} />
      </main>
    </div>
  );
}
