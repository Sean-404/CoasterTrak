/** Persist last map camera (+ optional focus) across /map remounts (Back, Discover, etc.). */

export const MAP_VIEW_STORAGE_KEY = "coastertrak:map-view:v1";

export type SavedMapView = {
  lat: number;
  lng: number;
  zoom: number;
  parkId?: number | null;
  coasterId?: number | null;
};

const DEFAULT_VIEW: SavedMapView = { lat: 25, lng: 10, zoom: 2 };

function isValidView(value: unknown): value is SavedMapView {
  if (!value || typeof value !== "object") return false;
  const v = value as SavedMapView;
  return (
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lng) &&
    Number.isFinite(v.zoom) &&
    v.lat >= -90 &&
    v.lat <= 90 &&
    v.lng >= -180 &&
    v.lng <= 180 &&
    v.zoom >= 1 &&
    v.zoom <= 20
  );
}

export function readSavedMapView(): SavedMapView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidView(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSavedMapView(view: SavedMapView): void {
  if (typeof window === "undefined") return;
  if (!isValidView(view)) return;
  try {
    sessionStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
    /* private mode / quota */
  }
}

export function clearSavedMapView(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MAP_VIEW_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getInitialMapView(): SavedMapView {
  return readSavedMapView() ?? DEFAULT_VIEW;
}
