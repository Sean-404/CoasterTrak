export type Park = {
  id: number;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
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
