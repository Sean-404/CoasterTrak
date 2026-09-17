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

/** Correct country when Wikidata P17 or legacy CSV is wrong for a known park name. */
export const PARK_COUNTRY_BY_NAME: Record<string, string> = {
  Nürburgring: "Germany",
};

/** Parks whose Wikidata item has no English label (WDQS would otherwise store the Q-id). */
export const PARK_DISPLAY_NAME_BY_WIKIDATA_ID: Record<string, string> = {
  Q2197655: "Plopsaland Ardennes",
  Q1164525: "La Ronde",
  Q1483280: "Gold Reef City",
  // Official WD label is "Magic Kingdom"; match Disney's Animal Kingdom / Hollywood Studios style.
  Q1324340: "Disney's Magic Kingdom",
};

/** Exact catalog name → preferred display label (legacy rows without a Wikidata id). */
export const PARK_DISPLAY_NAME_BY_EXACT_NAME: Record<string, string> = {
  "Magic Kingdom": "Disney's Magic Kingdom",
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

/**
 * Wikipedia `/extend` infobox parks that are the same venue as a catalog name
 * (rebrand, missing apostrophe, etc.).
 */
export const PARK_NAME_ALIASES: Record<string, string> = {
  "Mid America Adventure": "Six Flags St. Louis",
  "Mid-America Adventure": "Six Flags St. Louis",
  "Universal Islands of Adventure": "Universal's Islands of Adventure",
};

/**
 * Extra park installations from a shared Wikipedia article.
 * Do not set wikidata_id — one Q-id can bind to only one catalog row.
 */
export type EnsureCoasterInstallSpec = {
  parkName: string;
  parkNameAliases?: string[];
  name: string;
  nameAliases?: string[];
  coaster_type: string;
  manufacturer?: string;
  status: "Operating" | "Defunct";
  opening_year?: number;
  closing_year?: number | null;
  height_ft?: number;
  speed_mph?: number;
  length_ft?: number;
  inversions?: number;
  duration_s?: number;
  rcdb_id?: string;
  enwiki_title?: string;
};

/**
 * Mirror-copy rides that Wikidata/Wikipedia collapse onto one Q-id.
 * Keep the unique-bound row at its Wikidata park; ensure these siblings exist.
 */
export const ENSURE_COASTER_INSTALLS: EnsureCoasterInstallSpec[] = [
  {
    parkName: "Six Flags Darien Lake",
    name: "Ride of Steel",
    nameAliases: ["Superman Ride of Steel", "Superman – Ride of Steel", "Superman - Ride of Steel"],
    coaster_type: "Steel",
    manufacturer: "Intamin",
    status: "Operating",
    opening_year: 1999,
    height_ft: 208,
    speed_mph: 73,
    length_ft: 5400,
    inversions: 0,
    duration_s: 122,
    rcdb_id: "541",
    enwiki_title: "Ride of Steel",
  },
  {
    parkName: "Six Flags Great America",
    name: "Superman: Ultimate Flight",
    nameAliases: ["Superman Ultimate Flight"],
    coaster_type: "Steel",
    manufacturer: "Bolliger & Mabillard",
    status: "Operating",
    opening_year: 2003,
    height_ft: 106,
    speed_mph: 51,
    length_ft: 2769,
    inversions: 2,
    rcdb_id: "1977",
    enwiki_title: "Superman: Ultimate Flight",
  },
  {
    parkName: "Six Flags Great Adventure",
    name: "Superman: Ultimate Flight",
    nameAliases: ["Superman Ultimate Flight"],
    coaster_type: "Steel",
    manufacturer: "Bolliger & Mabillard",
    status: "Operating",
    opening_year: 2003,
    height_ft: 106,
    speed_mph: 51,
    length_ft: 2769,
    inversions: 2,
    rcdb_id: "1976",
    enwiki_title: "Superman: Ultimate Flight",
  },
  {
    parkName: "Six Flags St. Louis",
    parkNameAliases: ["Mid America Adventure", "Mid-America Adventure"],
    name: "Mr. Freeze",
    nameAliases: ["Mr. Freeze Reverse Blast", "Mr Freeze Reverse Blast"],
    coaster_type: "Steel",
    manufacturer: "Premier Rides",
    status: "Operating",
    opening_year: 1998,
    height_ft: 218,
    speed_mph: 70,
    length_ft: 1300,
    inversions: 1,
    enwiki_title: "Mr. Freeze (roller coaster)",
  },
  {
    parkName: "Carowinds",
    name: "Hurler",
    coaster_type: "Wood",
    manufacturer: "International Coasters",
    status: "Operating",
    opening_year: 1994,
    height_ft: 83,
    speed_mph: 50,
    length_ft: 3157,
    inversions: 0,
    duration_s: 120,
    rcdb_id: "85",
    enwiki_title: "Hurler (roller coaster)",
  },
  {
    parkName: "Universal Studios Japan",
    name: "Flight of the Hippogriff",
    coaster_type: "Steel",
    manufacturer: "Vekoma",
    status: "Operating",
    opening_year: 2014,
    height_ft: 43,
    speed_mph: 29,
    length_ft: 1099,
    inversions: 0,
    duration_s: 66,
    rcdb_id: "11885",
    enwiki_title: "Flight of the Hippogriff",
  },
  {
    parkName: "Universal Studios Hollywood",
    name: "Flight of the Hippogriff",
    coaster_type: "Steel",
    manufacturer: "Mack Rides",
    status: "Operating",
    opening_year: 2016,
    height_ft: 43,
    speed_mph: 29,
    length_ft: 1099,
    inversions: 0,
    duration_s: 66,
    rcdb_id: "12812",
    enwiki_title: "Flight of the Hippogriff",
  },
  {
    parkName: "Universal Studios Beijing",
    name: "Flight of the Hippogriff",
    coaster_type: "Steel",
    manufacturer: "Mack Rides",
    status: "Operating",
    opening_year: 2021,
    height_ft: 43,
    speed_mph: 29,
    length_ft: 1099,
    inversions: 0,
    duration_s: 66,
    rcdb_id: "17463",
    enwiki_title: "Flight of the Hippogriff",
  },
];

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
