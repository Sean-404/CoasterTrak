"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Coaster, Park } from "@/types/domain";
import { CoasterActions } from "./coaster-actions";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type Props = {
  parks: Park[];
  coasters: Coaster[];
};

export function ParkMap({ parks, coasters }: Props) {
  return (
    <MapContainer center={[25, 10]} zoom={2} scrollWheelZoom className="h-[65vh] w-full rounded border border-slate-200">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {parks.map((park) => {
        const parkCoasters = coasters.filter((c) => c.park_id === park.id);
        return (
          <Marker key={park.id} position={[park.latitude, park.longitude]} icon={icon}>
            <Popup>
              <div className="min-w-52">
                <h3 className="font-semibold">{park.name}</h3>
                <p className="mb-2 text-sm text-slate-600">{park.country}</p>
                {parkCoasters.map((coaster) => (
                  <div key={coaster.id} className="mb-2 border-t border-slate-200 pt-2">
                    <p className="text-sm font-medium">{coaster.name}</p>
                    <p className="text-xs text-slate-600">
                      {coaster.coaster_type} - {coaster.status}
                    </p>
                    <CoasterActions coasterId={coaster.id} />
                  </div>
                ))}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
