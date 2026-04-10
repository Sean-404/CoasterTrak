"use client";

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Coaster, Park } from "@/types/domain";
import { cleanCoasterName } from "@/lib/display";
import { CoasterActions } from "./coaster-actions";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type QueueRide = { name: string; isOpen: boolean; waitTime: number; lastUpdated: string };

type Props = {
  parks: Park[];
  coasters: Coaster[];
  queueTimesByParkId?: Record<number, QueueRide[]>;
};

function normalizeRideName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Strips common suffixes added by Kaggle (e.g. "(roller coaster)", "(steel)") so that
// "Wicker Man" and "Wicker Man (roller coaster)" collapse to the same key.
function normalizeCoasterBase(name: string) {
  return name
    .toLowerCase()
    .replace(/\s*\(roller coaster\)\s*/gi, "")
    .replace(/\s*\(coaster\)\s*/gi, "")
    .replace(/\s*\(steel\)\s*/gi, "")
    .replace(/\s*\(wooden\)\s*/gi, "")
    .replace(/\s*\(wood\)\s*/gi, "")
    .replace(/[^a-z0-9]/g, "");
}

function ParkPopupContent({
  park,
  parkCoasters,
  queueByName,
}: {
  park: Park;
  parkCoasters: Coaster[];
  queueByName: Map<string, QueueRide>;
}) {
  const [filter, setFilter] = useState("");

  // Deduplicate coasters whose names differ only by suffixes like "(roller coaster)".
  // Prefer whichever entry matches the queue-times data (shorter/cleaner name wins).
  const dedupedCoasters = (() => {
    const seen = new Map<string, Coaster>();
    for (const coaster of parkCoasters) {
      const key = normalizeCoasterBase(coaster.name);
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, coaster);
      } else {
        const thisHasQueue = queueByName.has(normalizeRideName(coaster.name));
        const existingHasQueue = queueByName.has(normalizeRideName(existing.name));
        if (thisHasQueue && !existingHasQueue) {
          seen.set(key, coaster);
        } else if (!thisHasQueue && !existingHasQueue && coaster.name.length < existing.name.length) {
          seen.set(key, coaster);
        }
      }
    }
    return Array.from(seen.values());
  })();

  const term = filter.toLowerCase();
  const visible = term ? dedupedCoasters.filter((c) => c.name.toLowerCase().includes(term)) : dedupedCoasters;

  return (
    <div className="w-64">
      <h3 className="font-bold text-slate-900">{park.name}</h3>
      <p className="text-xs text-slate-400">{park.country}</p>

      {dedupedCoasters.length > 5 && (
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
        {visible.map((coaster) => {
          const queueRide = queueByName.get(normalizeRideName(coaster.name));
          return (
            <div key={coaster.id} className="border-t border-slate-100 py-2 first:border-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-tight text-slate-900">{cleanCoasterName(coaster.name)}</p>
                {queueRide && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    queueRide.isOpen
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-500"
                  }`}>
                    {queueRide.isOpen ? `${queueRide.waitTime} min` : "Closed"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {coaster.coaster_type} · {coaster.status}
              </p>
              <CoasterActions coasterId={coaster.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ParkMap({ parks, coasters, queueTimesByParkId = {} }: Props) {
  return (
    <MapContainer
      center={[25, 10]}
      zoom={2}
      scrollWheelZoom
      worldCopyJump={false}
      maxBounds={[[-90, -180], [90, 180]]}
      maxBoundsViscosity={1.0}
      className="h-[65vh] w-full rounded border border-slate-200"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {parks.map((park) => {
          const parkCoasters = coasters.filter((c) => c.park_id === park.id);
          const parkQueueRides = park.queue_times_park_id ? (queueTimesByParkId[park.queue_times_park_id] ?? []) : [];
          const queueByName = new Map(parkQueueRides.map((ride) => [normalizeRideName(ride.name), ride]));
          return (
            <Marker key={park.id} position={[park.latitude, park.longitude]} icon={icon}>
              <Popup>
                <ParkPopupContent park={park} parkCoasters={parkCoasters} queueByName={queueByName} />
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
