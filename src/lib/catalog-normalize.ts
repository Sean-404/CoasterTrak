/**
 * Shared park dedupe + coaster park_id remapping used by the map and catalog pages.
 * Keeps ride lists aligned with what users see on the map.
 */

import type { Coaster, Park } from "@/types/domain";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { reconcileCountryWithCoords } from "@/lib/geo-country";
import {
  absorbReverseGeocodeParks,
  hasSharedDistinctiveParkToken,
  parkNamesMatch,
  snapOrphanCoastersToDisplayParks,
} from "@/lib/park-match";

export type NormalizedCatalog = {
  parks: Park[];
  coasters: Coaster[];
  /** duplicate / absorbed park id → canonical display park id */
  idRemap: Map<number, number>;
};

/** JSON-safe form for Next.js `unstable_cache` (Maps don't survive serialization). */
export type NormalizedCatalogSerialized = {
  parks: Park[];
  coasters: Coaster[];
  idRemapEntries: [number, number][];
};

export function serializeNormalizedCatalog(catalog: NormalizedCatalog): NormalizedCatalogSerialized {
  return {
    parks: catalog.parks,
    coasters: catalog.coasters,
    idRemapEntries: [...catalog.idRemap.entries()],
  };
}

export function deserializeNormalizedCatalog(
  cached: NormalizedCatalogSerialized | NormalizedCatalog,
): NormalizedCatalog {
  if ("idRemapEntries" in cached && Array.isArray(cached.idRemapEntries)) {
    return {
      parks: cached.parks,
      coasters: cached.coasters,
      idRemap: new Map(cached.idRemapEntries),
    };
  }
  // Defensive: older in-memory shape or accidental Map→object from cache.
  const remap = (cached as NormalizedCatalog).idRemap;
  if (remap instanceof Map) {
    return cached as NormalizedCatalog;
  }
  const entries = Object.entries((remap ?? {}) as Record<string, number>).map(
    ([from, to]) => [Number(from), Number(to)] as [number, number],
  );
  return {
    parks: cached.parks,
    coasters: cached.coasters,
    idRemap: new Map(entries),
  };
}

function hasUniversalStudiosVsIslandsConflict(a: string, b: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  const aIslands = /\bislands?\b|\badventure\b/.test(na);
  const bIslands = /\bislands?\b|\badventure\b/.test(nb);
  const aStudios = /\bstudios?\b/.test(na);
  const bStudios = /\bstudios?\b/.test(nb);
  const aResort = /\bresort\b/.test(na);
  const bResort = /\bresort\b/.test(nb);
  const aSpecificGate = aStudios || aIslands || /\bvolcano\b|\bepic\b/.test(na);
  const bSpecificGate = bStudios || bIslands || /\bvolcano\b|\bepic\b/.test(nb);
  const studiosVsIslands = (aIslands && bStudios) || (aStudios && bIslands);
  const resortVsGate = (aResort && bSpecificGate) || (bResort && aSpecificGate);
  return studiosVsIslands || resortVsGate;
}

function preferParkDisplayName(current: string, candidate: string): string {
  const score = (name: string) => {
    let s = 0;
    if (/\bat\s+universal\b/i.test(name)) s -= 3;
    if (/[™®©]/.test(name)) s -= 2;
    if (/,/.test(name)) s -= 2;
    s -= Math.max(0, name.length - 40) * 0.05;
    return s;
  };
  return score(candidate) > score(current) ? candidate : current;
}

function distanceKm(a: Park, b: Park): number {
  if (
    a.latitude == null ||
    b.latitude == null ||
    a.longitude == null ||
    b.longitude == null ||
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(b.latitude) ||
    !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.longitude)
  ) {
    return Infinity;
  }
  const dlat = (b.latitude - a.latitude) * 111;
  const dlng = (b.longitude - a.longitude) * 111 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function deduplicateParksForDisplay(geoAbsorbedParks: Park[]): {
  parks: Park[];
  idRemap: Map<number, number>;
} {
  const canonical = new Map<number, Park>();
  const idRemap = new Map<number, number>();

  function mergeInto(base: Park, duplicate: Park) {
    idRemap.set(duplicate.id, base.id);
    base.name = preferParkDisplayName(base.name, duplicate.name);
    base.latitude = duplicate.latitude ?? base.latitude;
    base.longitude = duplicate.longitude ?? base.longitude;
    const lat = base.latitude ?? null;
    const lng = base.longitude ?? null;
    base.country = reconcileCountryWithCoords(base.country ?? duplicate.country, lat, lng);
  }

  for (const park of geoAbsorbedParks) {
    if (idRemap.has(park.id)) continue;

    canonical.set(park.id, { ...park });

    for (const [, existing] of canonical) {
      if (existing.id === park.id) continue;
      if (idRemap.has(existing.id)) continue;

      const sameName = existing.name.toLowerCase().trim() === park.name.toLowerCase().trim();
      const fuzzyName = parkNamesMatch(existing.name, park.name);
      const dist = distanceKm(existing, park);
      const sameNameNearby = sameName && dist < 200;
      const fuzzyNameNearby =
        fuzzyName &&
        !sameName &&
        dist < 40 &&
        hasSharedDistinctiveParkToken(existing.name, park.name) &&
        !hasUniversalStudiosVsIslandsConflict(existing.name, park.name);

      if (sameNameNearby || fuzzyNameNearby) {
        mergeInto(existing, park);
        canonical.delete(park.id);
        break;
      }
    }
  }

  return { parks: Array.from(canonical.values()), idRemap };
}

/** Resolve a park id to its canonical display id after merge/absorb remaps. */
export function resolveCanonicalParkId(
  parkId: number,
  geoRemap: Map<number, number>,
  dedupeRemap: Map<number, number>,
): number {
  let id = parkId;
  const geo = geoRemap.get(id);
  if (geo !== undefined) id = geo;
  const dedupe = dedupeRemap.get(id);
  if (dedupe !== undefined) id = dedupe;
  return id;
}

/** All raw park ids that map to a canonical display park. */
export function sourceParkIdsForCanonical(
  canonicalParkId: number,
  geoRemap: Map<number, number>,
  dedupeRemap: Map<number, number>,
): number[] {
  const ids = new Set<number>([canonicalParkId]);
  for (const [from, to] of geoRemap) {
    if (to === canonicalParkId) ids.add(from);
  }
  for (const [from, to] of dedupeRemap) {
    if (to === canonicalParkId) ids.add(from);
  }
  return [...ids];
}

/** Combined idRemap: raw park id → canonical display park id. */
export function buildCombinedParkIdRemap(
  geoRemap: Map<number, number>,
  dedupeRemap: Map<number, number>,
): Map<number, number> {
  const combined = new Map<number, number>();
  const resolve = (parkId: number) => resolveCanonicalParkId(parkId, geoRemap, dedupeRemap);

  for (const id of new Set([...geoRemap.keys(), ...dedupeRemap.keys()])) {
    const canonical = resolve(id);
    if (canonical !== id) combined.set(id, canonical);
  }
  for (const [from, to] of dedupeRemap) {
    const canonical = resolve(from);
    if (canonical !== from) combined.set(from, canonical);
  }
  return combined;
}

export function normalizeCatalog(parks: Park[], coasters: Coaster[]): NormalizedCatalog {
  const geoAbsorb = absorbReverseGeocodeParks(parks);
  const deduplicated = deduplicateParksForDisplay(geoAbsorb.parks);
  const rawParkById = new Map(parks.map((p) => [p.id, p]));

  const combinedRemap = buildCombinedParkIdRemap(geoAbsorb.idRemap, deduplicated.idRemap);

  const remappedCoasters = snapOrphanCoastersToDisplayParks(
    coasters.map((c) => {
      let pid = c.park_id;
      const g = geoAbsorb.idRemap.get(pid);
      if (g !== undefined) pid = g;
      const d = deduplicated.idRemap.get(pid);
      if (d !== undefined) pid = d;
      return pid !== c.park_id ? { ...c, park_id: pid } : c;
    }),
    deduplicated.parks,
    rawParkById,
  ).map(applyCoasterKnownFixes);

  return {
    parks: deduplicated.parks,
    coasters: remappedCoasters,
    idRemap: combinedRemap,
  };
}
