/**
 * Find the catalog park closest to the visitor's location, for the map's
 * "Are you at …?" prompt. Runs in the browser only; the location is never sent anywhere.
 */

/** Within this distance of a park's pin, we ask whether you are at that park. */
export const AT_PARK_RADIUS_KM = 2.5;
/** Beyond this, the nearest park is too far away to mention. */
export const NEARBY_PARK_MAX_KM = 150;

const EARTH_RADIUS_KM = 6371;

export type LatLng = { lat: number; lng: number };

export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type NearestPark<P> = { park: P; distanceKm: number };

/** The closest park with coordinates, or null when there is none within NEARBY_PARK_MAX_KM. */
export function findNearestPark<P extends { latitude?: number | null; longitude?: number | null }>(
  parks: readonly P[],
  here: LatLng,
): NearestPark<P> | null {
  let best: NearestPark<P> | null = null;
  for (const park of parks) {
    if (park.latitude == null || park.longitude == null) continue;
    if (!Number.isFinite(park.latitude) || !Number.isFinite(park.longitude)) continue;
    const d = distanceKm(here, { lat: park.latitude, lng: park.longitude });
    if (!best || d < best.distanceKm) best = { park, distanceKm: d };
  }
  return best && best.distanceKm <= NEARBY_PARK_MAX_KM ? best : null;
}

export function isAtPark(nearest: NearestPark<unknown> | null): boolean {
  return nearest != null && nearest.distanceKm <= AT_PARK_RADIUS_KM;
}

/** "800 m" under a kilometre, "12 km" above. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
