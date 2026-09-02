"use client";

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Coaster, Park } from "@/types/domain";
import { cleanCoasterName } from "@/lib/display";
import { getMapTileLayer } from "@/lib/map-tiles";
import type { Units } from "@/lib/units";

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
  tightFocus,
  viewResetKey = 0,
}: {
  continent: string;
  selectedPark: Park | null;
  /** Zoom in closer when a specific ride is selected so the right park dominates the view. */
  tightFocus: boolean;
  /** Bumped when the user explicitly resets the map view. */
  viewResetKey?: number;
}) {
  const map = useMap();
  const prevContinent = useRef(continent);
  const prevResetKey = useRef(viewResetKey);

  useEffect(() => {
    if (!selectedPark) return;
    const targetZoom = tightFocus ? Math.max(map.getZoom(), 12) : Math.max(map.getZoom(), 6);
    map.flyTo([selectedPark.latitude, selectedPark.longitude], targetZoom, {
      duration: 1,
    });
    return () => {
      try {
        map.stop();
      } catch {
        /* map not yet ready */
      }
    };
  }, [selectedPark, map, tightFocus]);

  useEffect(() => {
    const continentChanged = prevContinent.current !== continent;
    const resetRequested = prevResetKey.current !== viewResetKey;
    prevContinent.current = continent;
    prevResetKey.current = viewResetKey;

    // Stay put when the park panel closes — only reframe for continent filter or Reset map.
    if (selectedPark) return;
    if (!continentChanged && !resetRequested) return;

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
  }, [continent, map, selectedPark, viewResetKey]);
  return null;
}

/** Click empty map / Escape to step back (ride → park → world). */
function MapClearSelection({
  enabled,
  hasCoasterSelected,
  onClearCoaster,
  onClearAll,
}: {
  enabled: boolean;
  hasCoasterSelected: boolean;
  onClearCoaster?: () => void;
  onClearAll?: () => void;
}) {
  useMapEvents({
    click() {
      if (!enabled) return;
      if (hasCoasterSelected) onClearCoaster?.();
      else onClearAll?.();
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Park ride sheet handles Escape when open; only clear ride pin focus here.
      if (!hasCoasterSelected) return;
      event.preventDefault();
      onClearCoaster?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, hasCoasterSelected, onClearCoaster]);

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
  onParkSelect?: (parkId: number) => void;
  onCoasterSelect?: (coasterId: number) => void;
  /** Clear selected ride but keep park focus (browse siblings). */
  onClearCoasterSelection?: () => void;
  /** Clear ride and park focus (keep current map position). */
  onClearAllSelection?: () => void;
  /** Clear focus and zoom back to continent/world. */
  onResetMapView?: () => void;
  /** Bumped to force world/continent reframing (Reset map). */
  viewResetKey?: number;
};

export function ParkMap({
  parks,
  coasters,
  continent = "All",
  selectedCoasterId = null,
  selectedParkId = null,
  focusPark = null,
  onParkSelect,
  onCoasterSelect,
  onClearCoasterSelection,
  onClearAllSelection,
  onResetMapView,
  viewResetKey = 0,
}: Props) {
  const selectedPark = useMemo(() => {
    if (!parks.length) return null;
    return parks.find((park) => park.id === selectedParkId) ?? null;
  }, [parks, selectedParkId]);

  const flyTargetPark = focusPark ?? selectedPark;
  const hasFocus = selectedCoasterId != null || selectedParkId != null;

  const selectedCoaster = useMemo(() => {
    if (selectedCoasterId == null) return null;
    return coasters.find((c) => c.id === selectedCoasterId) ?? null;
  }, [coasters, selectedCoasterId]);

  const tileLayer = useMemo(() => getMapTileLayer(), []);

  const selectedRidePin = useMemo(() => {
    if (!selectedCoaster || !flyTargetPark) return null;
    if (selectedCoaster.park_id !== flyTargetPark.id) return null;
    const title = cleanCoasterName(selectedCoaster.name);
    const position = selectedRidePinOffset(
      flyTargetPark.latitude,
      flyTargetPark.longitude,
      selectedCoaster.id,
    );
    return { position, title, parkName: flyTargetPark.name };
  }, [selectedCoaster, flyTargetPark]);

  return (
    <MapContainer
      center={[25, 10]}
      zoom={2}
      scrollWheelZoom={typeof window !== "undefined" ? window.matchMedia("(pointer: fine)").matches : true}
      worldCopyJump={false}
      maxBounds={[
        [-85, -210],
        [85, 210],
      ]}
      maxBoundsViscosity={0.7}
      className="h-[min(72vh,560px)] w-full rounded border border-slate-200 sm:h-[65vh]"
    >
      <MapController
        continent={continent}
        selectedPark={flyTargetPark}
        tightFocus={selectedCoasterId != null}
        viewResetKey={viewResetKey}
      />
      <MapClearSelection
        enabled={hasFocus}
        hasCoasterSelected={selectedCoasterId != null}
        onClearCoaster={onClearCoasterSelection}
        onClearAll={onClearAllSelection}
      />
      <TileLayer
        attribution={tileLayer.attribution}
        url={tileLayer.url}
        maxZoom={tileLayer.maxZoom}
      />
      <MarkerClusterGroup chunkedLoading>
        {parks.map((park) => {
          const dimOthers = selectedParkId != null && park.id !== selectedParkId ? 0.38 : 1;
          return (
            <Marker
              key={park.id}
              position={[park.latitude, park.longitude]}
              icon={icon}
              opacity={dimOthers}
              zIndexOffset={park.id === selectedParkId ? 500 : 0}
              eventHandlers={{
                click: (event) => {
                  L.DomEvent.stopPropagation(event);
                  onParkSelect?.(park.id);
                },
              }}
            />
          );
        })}
      </MarkerClusterGroup>
      {selectedRidePin ? (
        <Marker
          position={selectedRidePin.position}
          icon={selectedRideIcon}
          zIndexOffset={2500}
          interactive
          eventHandlers={{
            click: (event) => {
              L.DomEvent.stopPropagation(event);
              if (selectedCoasterId != null) onCoasterSelect?.(selectedCoasterId);
            },
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]} opacity={1} interactive>
            <div className="max-w-[12rem] text-center leading-tight">
              <div className="text-xs font-semibold text-slate-900">{selectedRidePin.title}</div>
              {selectedRidePin.parkName ? (
                <div className="mt-0.5 text-[10px] font-normal text-slate-600">
                  {selectedRidePin.parkName}
                </div>
              ) : null}
              {onClearCoasterSelection ? (
                <button
                  type="button"
                  className="mt-1 text-[10px] font-semibold text-amber-700 underline-offset-2 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onClearCoasterSelection();
                  }}
                >
                  All rides here
                </button>
              ) : null}
              {onResetMapView ? (
                <button
                  type="button"
                  className="mt-0.5 block w-full text-[10px] font-medium text-slate-500 underline-offset-2 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onResetMapView();
                  }}
                >
                  Reset map
                </button>
              ) : null}
            </div>
          </Tooltip>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
