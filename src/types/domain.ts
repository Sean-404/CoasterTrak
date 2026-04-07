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
  status: string;
};

export type CoasterWithPark = Coaster & {
  park?: Park;
};
