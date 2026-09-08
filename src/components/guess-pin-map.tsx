"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { getMapTileLayer } from "@/lib/map-tiles";

const guessIcon = L.divIcon({
  className: "leaflet-guess-pin",
  html: '<div class="leaflet-guess-pin__dot" aria-hidden="true"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const answerIcon = L.divIcon({
  className: "leaflet-guess-answer-pin",
  html: '<div class="leaflet-guess-answer-pin__dot" aria-hidden="true"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type LatLng = { lat: number; lng: number };

function ClickToPin({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (point: LatLng) => void;
}) {
  useMapEvents({
    click(event) {
      if (disabled) return;
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function MapSizeFix() {
  const map = useMap();

  useEffect(() => {
    const refresh = () => {
      map.invalidateSize();
    };
    refresh();
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener("resize", refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refresh);
    };
  }, [map]);

  return null;
}

const WORLD_VIEW = { center: [20, 10] as [number, number], zoom: 2 };

function ResetMapView({ roundKey }: { roundKey: string }) {
  const map = useMap();
  const seenKey = useRef<string | null>(null);

  useEffect(() => {
    if (seenKey.current === null) {
      seenKey.current = roundKey;
      return;
    }
    if (seenKey.current === roundKey) return;
    seenKey.current = roundKey;
    map.stop();
    map.flyTo(WORLD_VIEW.center, WORLD_VIEW.zoom, { duration: 0.6 });
  }, [roundKey, map]);

  return null;
}

function RevealFit({ guess, answer }: { guess: LatLng | null; answer: LatLng | null }) {
  const map = useMap();

  useEffect(() => {
    if (!answer) return;
    if (!guess) {
      map.flyTo([answer.lat, answer.lng], 6, { duration: 0.8 });
      return;
    }
    const bounds = L.latLngBounds(
      [guess.lat, guess.lng],
      [answer.lat, answer.lng],
    );
    map.fitBounds(bounds.pad(0.45), { maxZoom: 8, animate: true });
  }, [answer, guess, map]);

  return null;
}

export function GuessPinMap({
  guess,
  answer,
  disabled,
  onPick,
  roundKey = "",
  className = "h-full w-full max-w-full rounded-xl border border-slate-200 lg:h-[min(65vh,560px)]",
}: {
  guess: LatLng | null;
  answer: LatLng | null;
  disabled: boolean;
  onPick: (point: LatLng) => void;
  roundKey?: string;
  className?: string;
}) {
  const tileLayer = useMemo(() => getMapTileLayer(), []);
  const line = guess && answer ? ([
    [guess.lat, guess.lng],
    [answer.lat, answer.lng],
  ] as [number, number][]) : null;

  return (
    <MapContainer
      center={WORLD_VIEW.center}
      zoom={WORLD_VIEW.zoom}
      scrollWheelZoom
      worldCopyJump={false}
      maxBounds={[
        [-85, -210],
        [85, 210],
      ]}
      maxBoundsViscosity={0.7}
      className={className}
    >
      <TileLayer attribution={tileLayer.attribution} url={tileLayer.url} maxZoom={tileLayer.maxZoom} />
      <MapSizeFix />
      <ResetMapView roundKey={roundKey} />
      <ClickToPin disabled={disabled} onPick={onPick} />
      <RevealFit guess={guess} answer={answer} />
      {guess ? <Marker position={[guess.lat, guess.lng]} icon={guessIcon} /> : null}
      {answer ? <Marker position={[answer.lat, answer.lng]} icon={answerIcon} /> : null}
      {line ? <Polyline positions={line} pathOptions={{ color: "#f59e0b", weight: 2, opacity: 0.9 }} /> : null}
    </MapContainer>
  );
}
