/** Shared catalog override tables used by sync and post-sync auto-repair. */

/** Multi-install / mislabeled Wikidata items → preferred catalog park name. */
export const COASTER_PARK_OVERRIDE_BY_WIKIDATA_ID: Record<string, string> = {
  Q3073731: "Universal's Islands of Adventure",
  Q21051432: "Universal Studios Florida",
  Q13415786: "Camelot Theme Park",
  Q10658106: "Dyrehavsbakken",
  Q1415640: "Dyrehavsbakken",
  Q57522641: "Luna Park Sydney",
  Q87730001: "Nickelodeon Universe American Dream",
  Q105095530: "Nickelodeon Universe American Dream",
  Q87721534: "Nickelodeon Universe American Dream",
  Q74420101: "Nickelodeon Universe American Dream",
  Q7499849: "Brean Leisure Park",
  Q2462361: "Gröna Lund",
  Q4827808: "Nickelodeon Universe",
  Q319758: "Europa-Park",
  Q2260635: "Kings Island",
  Q22666883: "Shanghai Disney Resort",
  Q2518728: "Parque de la Ciudad",
  Q96996314: "Plopsaland Belgium",
  Q483513: "Gold Reef City",
  Q2446903: "Gold Reef City",
  Q130213969: "COTALAND",
  Q137049593: "Gumbuya World",
  Q86663690: "Happy Valley Beijing",
};

/** Parks whose Wikidata item has no English label (WDQS would otherwise store the Q-id). */
export const PARK_DISPLAY_NAME_BY_WIKIDATA_ID: Record<string, string> = {
  Q2197655: "Plopsaland Ardennes",
  Q1164525: "La Ronde",
  Q1483280: "Gold Reef City",
};

/** Parks that may be missing from Wikidata ingest — ensure they exist before relinking coasters. */
export type EnsureParkSpec = {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  external_source?: string;
  external_id?: string;
};

export const ENSURE_PARKS: EnsureParkSpec[] = [
  {
    name: "COTALAND",
    country: "United States",
    latitude: 30.137,
    longitude: -97.641,
    external_source: "wikidata",
    external_id: "Q138589719",
  },
  {
    name: "Gumbuya World",
    country: "Australia",
    latitude: -38.0692,
    longitude: 145.659,
    external_source: "wikidata",
    external_id: "Q5618090",
  },
  {
    name: "Smoky Mountain Alpine Coaster",
    country: "United States",
    latitude: 35.7934,
    longitude: -83.5965,
  },
  {
    name: "Gold Reef City",
    country: "South Africa",
    latitude: -26.2378,
    longitude: 28.0142,
    external_source: "wikidata",
    external_id: "Q1483280",
  },
];
