"use client";

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Coaster, Park } from "@/types/domain";
import {
  normalizeCoasterDedupKey,
  preferCoasterForDedup,
} from "@/lib/coaster-dedup";
import { cleanCoasterName, matchesSearchQuery } from "@/lib/display";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { reconcileCountryWithCoords } from "@/lib/geo-country";
import { fmtDuration, fmtHeight, fmtLength, fmtSpeed, type Units } from "@/lib/units";
import { CoasterActions } from "./coaster-actions";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const CONTINENT_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  "North America": { center: [42, -98], zoom: 3 },
  "South America": { center: [-15, -58], zoom: 3 },
  Europe: { center: [52, 14], zoom: 4 },
  Asia: { center: [32, 105], zoom: 3 },
  Oceania: { center: [-28, 140], zoom: 4 },
  Africa: { center: [5, 22], zoom: 3 },
};

function MapController({ continent }: { continent: string }) {
  const map = useMap();
  useEffect(() => {
    if (continent === "All") {
      map.flyTo([25, 10], 2, { duration: 1 });
    } else {
      const view = CONTINENT_VIEWS[continent];
      if (view) map.flyTo(view.center, view.zoom, { duration: 1 });
    }
    return () => {
      try {
        map.stop();
      } catch {
        /* map not yet ready */
      }
    };
  }, [continent, map]);
  return null;
}

type Props = {
  parks: Park[];
  coasters: Coaster[];
  units?: Units;
  continent?: string;
};

function ParkPopupContent({
  park,
  parkCoasters,
  units = "imperial",
}: {
  park: Park;
  parkCoasters: Coaster[];
  units?: Units;
}) {
  const [filter, setFilter] = useState("");

  /** Same physical ride: merged spellings + queue variants (e.g. Standby vs Single rider). */
  const rideGroups = (() => {
    const byKey = new Map<string, Coaster[]>();
    for (const coaster of parkCoasters) {
      const key = normalizeCoasterDedupKey(coaster.name);
      const arr = byKey.get(key) ?? [];
      arr.push(coaster);
      byKey.set(key, arr);
    }
    return Array.from(byKey.values()).map((members) => {
      let primary = members[0];
      for (const c of members.slice(1)) {
        primary = preferCoasterForDedup(primary, c);
      }
      return { members, primary };
    });
  })();

  const visible = filter.trim()
    ? rideGroups.filter((g) => g.members.some((c) => matchesSearchQuery(c.name, filter)))
    : rideGroups;

  return (
    <div className="w-64">
      <h3 className="font-bold text-slate-900">{park.name}</h3>
      <p className="text-xs text-slate-400">
        {reconcileCountryWithCoords(park.country, park.latitude ?? null, park.longitude ?? null)}
      </p>

      {rideGroups.length > 5 && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter rides…"
          aria-label="Filter rides"
          className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      )}

      <div className="mt-2 max-h-64 overflow-y-auto pr-0.5">
        {visible.length === 0 && <p className="text-xs text-slate-400">No matches</p>}
        {visible.map(({ members, primary: coaster }) => {
          const isDefunct = coaster.status === "Defunct";
          const operating = coaster.status === "Operating";

          const stats: string[] = [];
          const len = fmtLength(coaster.length_ft, units);
          const spd = fmtSpeed(coaster.speed_mph, units);
          const ht = fmtHeight(coaster.height_ft, units);
          if (len) stats.push(len);
          if (spd) stats.push(spd);
          if (ht) stats.push(`${ht} tall`);
          if (coaster.inversions != null) stats.push(`${coaster.inversions} inv`);
          const dur = fmtDuration(coaster.duration_s);
          if (dur) stats.push(dur);

          const rideType = effectiveCoasterType(coaster.coaster_type, coaster.manufacturer ?? null);
          const title = cleanCoasterName(coaster.name);
          return (
            <div key={coaster.id} className="border-t border-slate-100 py-2 first:border-0">
              <p className="text-sm font-semibold leading-tight text-slate-900">{title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {rideType !== "Unknown" && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    {rideType}
                  </span>
                )}
                {coaster.manufacturer && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    {coaster.manufacturer}
                  </span>
                )}
                {isDefunct ? (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                    Defunct{coaster.closing_year ? ` · ${coaster.closing_year}` : ""}
                  </span>
                ) : (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      operating ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {operating ? "Operating" : coaster.status}
                  </span>
                )}
              </div>
              {stats.length > 0 && (
                <p className="mt-1 text-[10px] text-slate-400">{stats.join(" · ")}</p>
              )}
              <CoasterActions coasterId={coaster.id} disableWishlist={isDefunct} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ParkMap({ parks, coasters, units = "imperial", continent = "All" }: Props) {
  return (
    <MapContainer
      center={[25, 10]}
      zoom={2}
      scrollWheelZoom
      worldCopyJump={false}
      maxBounds={[
        [-85, -210],
        [85, 210],
      ]}
      maxBoundsViscosity={0.7}
      className="h-[65vh] w-full rounded border border-slate-200"
    >
      <MapController continent={continent} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {parks.map((park) => {
          const parkCoasters = coasters.filter((c) => c.park_id === park.id);
          return (
            <Marker key={park.id} position={[park.latitude, park.longitude]} icon={icon}>
              <Popup>
                <ParkPopupContent park={park} parkCoasters={parkCoasters} units={units} />
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
