import type { Coaster, Park } from "@/types/domain";

export const sampleParks: Park[] = [
  { id: 1, name: "Alton Towers", country: "United Kingdom", latitude: 52.9894, longitude: -1.8919 },
  { id: 2, name: "Cedar Point", country: "United States", latitude: 41.4822, longitude: -82.6835 },
  { id: 3, name: "Europa-Park", country: "Germany", latitude: 48.2661, longitude: 7.7216 },
  { id: 4, name: "Fuji-Q Highland", country: "Japan", latitude: 35.4869, longitude: 138.7804 },
];

export const sampleCoasters: Coaster[] = [
  { id: 1, park_id: 1, name: "Nemesis Reborn", coaster_type: "Inverted", status: "Operating" },
  { id: 2, park_id: 1, name: "Wicker Man", coaster_type: "Wood", status: "Operating" },
  { id: 3, park_id: 2, name: "Steel Vengeance", coaster_type: "Hybrid", status: "Operating" },
  { id: 4, park_id: 2, name: "Millennium Force", coaster_type: "Steel", status: "Operating" },
  { id: 5, park_id: 3, name: "Blue Fire", coaster_type: "Launch", status: "Operating" },
  { id: 6, park_id: 4, name: "Eejanaika", coaster_type: "4D", status: "Operating" },
];
