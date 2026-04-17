"use client";

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
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
import { normalizeLifecycleStatus } from "@/lib/coaster-status";
import { CoasterActions } from "./coaster-actions";
import { CoasterThumbnail } from "./coaster-thumbnail";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const selectedRideIcon = L.divIcon({
  className: "leaflet-selected-ride-pin",
  html:
    '<div class="leaflet-selected-ride-pin__dot" aria-hidden="true"><span class="leaflet-selected-ride-pin__glyph">🎢</span></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/**
 * Stable offset from the park point so the “selected ride” marker is visible next to the
 * default park pin. We do not store per-ride coordinates yet; this is for map clarity only.
 */
function selectedRidePinOffset(lat: number, lng: number, seed: number): [number, number] {
  const t = ((seed * 2654435761) >>> 0) / 4294967296;
  const angle = t * 2 * Math.PI;
  const meters = 58 + (seed % 22);
  const dLat = (Math.cos(angle) * meters) / 111_320;
  const dLng =
    (Math.sin(angle) * meters) / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lat + dLat, lng + dLng];
}

const CONTINENT_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  "North America": { center: [42, -98], zoom: 3 },
  "South America": { center: [-15, -58], zoom: 3 },
  Europe: { center: [52, 14], zoom: 4 },
  Asia: { center: [32, 105], zoom: 3 },
  Oceania: { center: [-28, 140], zoom: 4 },
  Africa: { center: [5, 22], zoom: 3 },
};

function MapController({
  continent,
  selectedPark,
  markerByParkId,
  tightFocus,
}: {
  continent: string;
  selectedPark: Park | null;
  markerByParkId: MutableRefObject<Map<number, L.Marker>>;
  /** Zoom in closer when a specific ride is selected so the right park dominates the view. */
  tightFocus: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedPark) return;
    const targetZoom = tightFocus ? Math.max(map.getZoom(), 12) : Math.max(map.getZoom(), 6);
    map.flyTo([selectedPark.latitude, selectedPark.longitude], targetZoom, {
      duration: 1,
    });
    markerByParkId.current.get(selectedPark.id)?.openPopup();
    return () => {
      try {
        map.stop();
      } catch {
        /* map not yet ready */
      }
    };
  }, [selectedPark, map, markerByParkId, tightFocus]);

  useEffect(() => {
    if (selectedPark) return;
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
  }, [continent, map, selectedPark]);
  return null;
}

type Props = {
  parks: Park[];
  coasters: Coaster[];
  units?: Units;
  continent?: string;
  selectedCoasterId?: number | null;
  selectedParkId?: number | null;
  /** Park row for the selected coaster (full catalog), used when markers are filtered out. */
  focusPark?: Park | null;
  onCoasterSelect?: (coasterId: number) => void;
};

type PreviewState = {
  imageUrl: string;
  name: string;
};

function ParkPopupContent({
  park,
  parkCoasters,
  units = "imperial",
  selectedCoasterId,
  onCoasterSelect,
  onPreview,
}: {
  park: Park;
  parkCoasters: Coaster[];
  units?: Units;
  selectedCoasterId?: number | null;
  onCoasterSelect?: (coasterId: number) => void;
  onPreview: (payload: PreviewState) => void;
}) {
  const [filter, setFilter] = useState("");

  /** Same physical ride: merged spellings + queue variants (e.g. Standby vs Single rider). */
  const rideGroups = (() => {
    const byKey = new Map<string, Coaster[]>();
    const keyByName = new Map<string, string>();
    for (const coaster of parkCoasters) {
      const nameKey = normalizeCoasterDedupKey(coaster.name);
      const wdKeyRaw = coaster.wikidata_id?.trim().toUpperCase();
      const wdKey = wdKeyRaw ? `wd:${wdKeyRaw}` : null;
      const existingByWd = wdKey ? byKey.get(wdKey) : undefined;
      const existingNameGroupKey = keyByName.get(nameKey);
      const groupKey = existingByWd
        ? (wdKey as string)
        : existingNameGroupKey ?? wdKey ?? `name:${nameKey}`;
      const arr = byKey.get(groupKey) ?? [];
      arr.push(coaster);
      byKey.set(groupKey, arr);
      keyByName.set(nameKey, groupKey);
    }
    return Array.from(byKey.values()).map((members) => {
      let primary = members[0];
      for (const c of members.slice(1)) {
        primary = preferCoasterForDedup(primary, c);
      }
      if (!primary.image_url) {
        const withImage = members.find((c) => Boolean(c.image_url));
        if (withImage?.image_url) primary = { ...primary, image_url: withImage.image_url };
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
          const lifecycle = normalizeLifecycleStatus(coaster.status, {
            closingYear: coaster.closing_year,
          });
          const isDefunct = lifecycle === "Defunct";
          const isSelected =
            selectedCoasterId != null && members.some((member) => member.id === selectedCoasterId);

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
            <div
              key={coaster.id}
              className={`border-t border-slate-100 py-2 first:border-0 ${
                isSelected ? "rounded-md bg-amber-50 px-1" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <CoasterThumbnail
                  name={title}
                  imageUrl={coaster.image_url}
                  sizeClassName="h-10 w-10"
                  onPreview={onPreview}
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onCoasterSelect?.(coaster.id)}
                    className="text-left text-sm font-semibold leading-tight text-slate-900 hover:underline"
                  >
                    {title}
                  </button>
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
                    {isDefunct && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        Defunct{coaster.closing_year ? ` · ${coaster.closing_year}` : ""}
                      </span>
                    )}
                  </div>
                  {stats.length > 0 && (
                    <p className="mt-1 text-[10px] text-slate-400">{stats.join(" · ")}</p>
                  )}
                  <CoasterActions coasterId={coaster.id} disableWishlist={isDefunct} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ParkMap({
  parks,
  coasters,
  units = "imperial",
  continent = "All",
  selectedCoasterId = null,
  selectedParkId = null,
  focusPark = null,
  onCoasterSelect,
}: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const markerByParkId = useRef<Map<number, L.Marker>>(new Map());
  const canPortal = typeof window !== "undefined";
  const selectedPark = useMemo(() => {
    if (!parks.length) return null;
    return parks.find((park) => park.id === selectedParkId) ?? null;
  }, [parks, selectedParkId]);

  const flyTargetPark = focusPark ?? selectedPark;

  const selectedCoaster = useMemo(() => {
    if (selectedCoasterId == null) return null;
    return coasters.find((c) => c.id === selectedCoasterId) ?? null;
  }, [coasters, selectedCoasterId]);

  const selectedRidePin = useMemo(() => {
    if (!selectedCoaster || !flyTargetPark) return null;
    if (selectedCoaster.park_id !== flyTargetPark.id) return null;
    const title = cleanCoasterName(selectedCoaster.name);
    const position = selectedRidePinOffset(
      flyTargetPark.latitude,
      flyTargetPark.longitude,
      selectedCoaster.id,
    );
    return { position, title };
  }, [selectedCoaster, flyTargetPark]);

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  return (
    <>
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
        <MapController
          continent={continent}
          selectedPark={flyTargetPark}
          markerByParkId={markerByParkId}
          tightFocus={selectedCoasterId != null}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <MarkerClusterGroup chunkedLoading>
          {parks.map((park) => {
            const parkCoasters = coasters.filter((c) => c.park_id === park.id);
            const dimOthers =
              selectedParkId != null && park.id !== selectedParkId ? 0.38 : 1;
            return (
              <Marker
                key={park.id}
                position={[park.latitude, park.longitude]}
                icon={icon}
                opacity={dimOthers}
                zIndexOffset={park.id === selectedParkId ? 500 : 0}
                ref={(marker) => {
                  if (marker) {
                    markerByParkId.current.set(park.id, marker);
                  } else {
                    markerByParkId.current.delete(park.id);
                  }
                }}
              >
                <Popup>
                  <ParkPopupContent
                    park={park}
                    parkCoasters={parkCoasters}
                    units={units}
                    selectedCoasterId={selectedCoasterId}
                    onCoasterSelect={onCoasterSelect}
                    onPreview={(payload) => {
                      flushSync(() => {
                        setPreview(payload);
                      });
                    }}
                  />
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
        {selectedRidePin ? (
          <Marker
            position={selectedRidePin.position}
            icon={selectedRideIcon}
            zIndexOffset={2500}
            interactive
          >
            <Tooltip permanent direction="top" offset={[0, -10]} opacity={1}>
              <div className="max-w-[11rem] text-center leading-tight">
                <div className="text-xs font-semibold text-slate-900">{selectedRidePin.title}</div>
                <div className="mt-0.5 text-[10px] font-normal text-slate-600">
                  Offset from park pin for visibility (no ride GPS in data yet)
                </div>
              </div>
            </Tooltip>
          </Marker>
        ) : null}
      </MapContainer>
      {canPortal &&
        preview &&
        createPortal(
          <div
            className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            onClick={(event) => {
              if (event.target === event.currentTarget) setPreview(null);
            }}
          >
            <button
              type="button"
              className="absolute right-4 top-4 min-h-10 min-w-10 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-white active:scale-95"
              onClick={() => setPreview(null)}
            >
              Close
            </button>
            <img
              src={preview.imageUrl}
              alt={preview.name}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              referrerPolicy="no-referrer"
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
