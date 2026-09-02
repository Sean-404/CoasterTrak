/** Leaflet raster basemap config (CARTO Voyager when keyed, otherwise OpenStreetMap). */
export type MapTileLayerConfig = {
  url: string;
  attribution: string;
  maxZoom?: number;
};

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`;

/** CARTO raster tiles require a free API key — https://carto.com/basemaps/apikey */
export function getMapTileLayer(): MapTileLayerConfig {
  const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();
  if (cartoKey) {
    return {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 20,
    };
  }

  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
  };
}
