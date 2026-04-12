export type Park = {
  id: number;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  queue_times_park_id?: number | null;
};

export type Coaster = {
  id: number;
  park_id: number;
  name: string;
  coaster_type: string;
  manufacturer?: string | null;
  status: string;
  /** Wikidata / Wikipedia enrichment fields (nullable until synced) */
  wikidata_id?: string | null;
  length_ft?: number | null;
  speed_mph?: number | null;
  height_ft?: number | null;
  inversions?: number | null;
  /** Ride duration (track time), seconds — Wikidata / Wikipedia */
  duration_s?: number | null;
  opening_year?: number | null;
  closing_year?: number | null;
};

export type CoasterWithPark = Coaster & {
  park?: Park;
};
