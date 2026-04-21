"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { CoasterActions } from "@/components/coaster-actions";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Coaster, Park } from "@/types/domain";
import { cleanCoasterName, matchesSearchQuery } from "@/lib/display";
import { reconcileCountryWithCoords } from "@/lib/geo-country";
import { continentIdForCountryLabel } from "@/lib/country-continent";
import { applyCoasterKnownFixes, sanitizeCoasterImageUrl } from "@/lib/coaster-known-fixes";
import {
  absorbReverseGeocodeParks,
  isLikelyWaterParkName,
  parkNamesMatch,
  snapOrphanCoastersToDisplayParks,
} from "@/lib/park-match";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";
import { useUnits } from "@/components/providers";
import { UnitsToggle } from "@/components/units-toggle";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { normalizeLifecycleStatus } from "@/lib/coaster-status";
import { fmtDuration, fmtHeight, fmtLength, fmtSpeed, type Units } from "@/lib/units";
import {
  isLikelyCoasterEntry,
  isPlaceholderCoasterName,
  normalizeCoasterDedupKey,
  coasterDedupLookupKeys,
  preferCoasterForDedup,
  isThrillCoaster,
} from "@/lib/coaster-dedup";

const CONTINENTS = ["All", "North America", "South America", "Europe", "Asia", "Oceania", "Africa"] as const;
type Continent = (typeof CONTINENTS)[number];
type ViewMode = "map" | "list";
type RideOption = {
  coaster: Coaster;
  parkName: string;
  /** Resolved display country (matches Country filter / park dropdown). */
  country: string;
};

const INITIAL_LIST_VISIBLE_RIDES = 40;
const LOAD_MORE_LIST_RIDES_STEP = 40;
const MAP_CACHE_TTL_MS = 5 * 60 * 1000;
const PARK_SELECT_COLUMNS = "id,name,country,latitude,longitude";
const COASTER_SELECT_COLUMNS =
  "id,park_id,name,coaster_type,manufacturer,status,wikidata_id,image_url,length_ft,speed_mph,height_ft,inversions,duration_s,opening_year,closing_year";

type BrowserSupabase = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
type MapCatalogCache = {
  loadedAt: number;
  parks: Park[];
  coasters: Coaster[];
};

let MAP_CATALOG_CACHE: MapCatalogCache | null = null;
let MAP_CATALOG_IN_FLIGHT: Promise<{ parks: Park[]; coasters: Coaster[] }> | null = null;

function isMapCatalogCacheFresh(): boolean {
  if (!MAP_CATALOG_CACHE) return false;
  return Date.now() - MAP_CATALOG_CACHE.loadedAt < MAP_CACHE_TTL_MS;
}

function storeMapCatalogCache(parks: Park[], coasters: Coaster[]) {
  MAP_CATALOG_CACHE = {
    loadedAt: Date.now(),
    parks: [...parks],
    coasters: [...coasters],
  };
}

async function loadMapCatalog(supabase: BrowserSupabase): Promise<{ parks: Park[]; coasters: Coaster[] }> {
  if (isMapCatalogCacheFresh() && MAP_CATALOG_CACHE) {
    return { parks: [...MAP_CATALOG_CACHE.parks], coasters: [...MAP_CATALOG_CACHE.coasters] };
  }
  if (MAP_CATALOG_IN_FLIGHT) return MAP_CATALOG_IN_FLIGHT;

  MAP_CATALOG_IN_FLIGHT = (async () => {
    const [parksRes, coastersRes] = await Promise.all([
      fetchAllPages<Park>(SUPABASE_PAGE_SIZE, (from, to) =>
        supabase.from("parks").select(PARK_SELECT_COLUMNS).order("id", { ascending: true }).range(from, to),
      ),
      fetchAllPages<Coaster>(SUPABASE_PAGE_SIZE, (from, to) =>
        supabase
          .from("coasters")
          .select(COASTER_SELECT_COLUMNS)
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);

    const parks = !parksRes.error && parksRes.data.length ? parksRes.data.map(fixUsParkLongitude) : [];
    const coasters = !coastersRes.error && coastersRes.data.length ? coastersRes.data.map(applyCoasterKnownFixes) : [];
    storeMapCatalogCache(parks, coasters);
    return { parks, coasters };
  })().finally(() => {
    MAP_CATALOG_IN_FLIGHT = null;
  });

  return MAP_CATALOG_IN_FLIGHT;
}

function Shimmer({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/90 ${className}`} aria-hidden />;
}

function MapAreaSkeleton() {
  const dots = [
    { top: "18%", left: "22%" },
    { top: "28%", left: "48%" },
    { top: "42%", left: "35%" },
    { top: "38%", left: "62%" },
    { top: "55%", left: "28%" },
    { top: "52%", left: "55%" },
    { top: "68%", left: "42%" },
    { top: "72%", left: "68%" },
  ];
  return (
    <div
      className="relative h-[65vh] w-full overflow-hidden rounded border border-slate-200 bg-slate-50"
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 55% 45% at 28% 38%, rgb(203 213 225 / 0.55), transparent 50%),
            radial-gradient(ellipse 50% 40% at 72% 58%, rgb(203 213 225 / 0.4), transparent 50%),
            linear-gradient(to bottom, rgb(248 250 252), rgb(241 245 249))
          `,
        }}
      />
      {dots.map((pos, i) => (
        <span
          key={i}
          className="absolute h-2.5 w-2.5 animate-pulse rounded-full bg-slate-400/70 shadow-sm"
          style={{ top: pos.top, left: pos.left }}
        />
      ))}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/85 px-3 py-2 backdrop-blur-sm">
        <Shimmer className="h-2.5 w-24" />
        <Shimmer className="h-2.5 w-16" />
      </div>
    </div>
  );
}

function ListRowsSkeleton() {
  return (
    <section className="rounded border border-slate-200 bg-white" aria-hidden>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 p-3 sm:flex-row sm:items-start">
            <Shimmer className="h-14 w-14 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <Shimmer className="h-4 w-[min(100%,14rem)]" />
              <Shimmer className="h-3 w-32" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Shimmer className="h-5 w-16 rounded-full" />
                <Shimmer className="h-5 w-20 rounded-full" />
              </div>
              <Shimmer className="h-3 w-48 max-w-full" />
              <div className="flex gap-2 pt-1">
                <Shimmer className="h-8 w-24 rounded-lg" />
                <Shimmer className="h-8 w-28 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MapPageCatalogSkeleton({
  viewMode,
  setViewMode,
  units,
  setUnits,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  units: Units;
  setUnits: (u: Units) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2" aria-busy="true" aria-label="Loading map layout">
      <div className="flex flex-wrap items-center gap-3">
        <Shimmer className="h-10 w-full sm:w-80" />
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("map")}
            aria-pressed={viewMode === "map"}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "map"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "list"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            List
          </button>
        </div>
        <div className="ml-auto shrink-0">
          <UnitsToggle units={units} onChange={setUnits} />
        </div>
      </div>
      {viewMode === "list" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1 sm:w-60">
            <Shimmer className="h-3.5 w-16" />
            <Shimmer className="h-10 w-full rounded border border-slate-200/80 bg-white" />
          </div>
          <div className="space-y-1 sm:w-72">
            <Shimmer className="h-3.5 w-10" />
            <Shimmer className="h-10 w-full rounded border border-slate-200/80 bg-white" />
          </div>
        </div>
      ) : null}
      {viewMode === "map" ? (
        <div className="flex flex-wrap gap-1">
          {CONTINENTS.map((c) => (
            <Shimmer key={c} className="h-8 min-w-[4.75rem] flex-1 rounded-full sm:flex-none sm:min-w-[5.5rem]" />
          ))}
        </div>
      ) : null}
      <div className="mt-1 flex items-center gap-2">
        <Shimmer className="h-4 w-4 rounded border border-slate-200" />
        <Shimmer className="h-3.5 w-52 max-w-full" />
      </div>
      <p className="mt-2 text-sm text-slate-500" role="status">
        Loading catalog&hellip;
      </p>
      <div className="mt-1">{viewMode === "map" ? <MapAreaSkeleton /> : <ListRowsSkeleton />}</div>
    </div>
  );
}

const ParkMap = dynamic(() => import("@/components/park-map").then((m) => m.ParkMap), {
  ssr: false,
  loading: () => <MapAreaSkeleton />,
});

/** Queue-Times once shipped Epic Universe with +81°E instead of -81°W; fix display until DB sync overwrites. */
function fixUsParkLongitude(p: Park): Park {
  const lat = p.latitude ?? 0;
  const lng = p.longitude ?? 0;
  const country = (p.country ?? "").toLowerCase();
  if (country.includes("united states") && lng > 0 && lat >= 22 && lat <= 50) {
    return { ...p, longitude: -lng };
  }
  return p;
}

function getContinent(lat: number, lng: number): Continent {
  if (lat > 15 && lat < 72 && lng > -168 && lng < -52) return "North America";
  if (lat > -56 && lat < 15 && lng > -82 && lng < -34) return "South America";
  // Europe before Asia so Turkey/western Russia stay in Europe
  if (lat > 34 && lat < 72 && lng > -25 && lng < 40) return "Europe";
  if (lat > -47 && lat < -10 && lng > 110 && lng < 180) return "Oceania";
  // Arabian Peninsula + Gulf — classify as Asia (not Africa). Must run before Africa bbox.
  if (lat > 12 && lat < 33 && lng > 34 && lng < 62) return "Asia";
  // Africa (Maghreb + sub-Saharan + nearby islands like Cape Verde/Mauritius/Seychelles).
  if (lat > -40 && lat < 38 && lng > -27 && lng < 64) return "Africa";
  // Remaining eastern hemisphere: central Asia, India, Russia east of Europe, etc.
  if (lat > -10 && lat < 77 && lng > 25 && lng < 180) return "Asia";
  return "All";
}

function continentFromCountryLabel(country: string | null | undefined): Continent {
  const raw = (country ?? "").trim();
  if (!raw) return "All";

  const candidates = new Set<string>([
    raw,
    raw.replace(/\s+/g, " ").trim(),
    raw.split(",")[0]?.trim() ?? "",
    raw.replace(/\s*\(.*?\)\s*/g, "").trim(),
  ]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const id = continentIdForCountryLabel(candidate);
    switch (id) {
      case "AF":
        return "Africa";
      case "AS":
        return "Asia";
      case "EU":
        return "Europe";
      case "NA":
        return "North America";
      case "OC":
        return "Oceania";
      case "SA":
        return "South America";
      default:
        break;
    }
  }
  return "All";
}

function getParkContinent(park: Park): Continent {
  const lat = park.latitude;
  const lng = park.longitude;
  const resolvedCountry = reconcileCountryWithCoords(park.country, lat ?? null, lng ?? null);

  const byCountry = continentFromCountryLabel(resolvedCountry) !== "All"
    ? continentFromCountryLabel(resolvedCountry)
    : continentFromCountryLabel(park.country);
  if (byCountry !== "All") return byCountry;

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    const byCoords = getContinent(lat, lng);
    if (byCoords !== "All") return byCoords;
  }
  return "All";
}

function fillMissingMapImages(rows: Coaster[]): Coaster[] {
  const imageByWikidataId = new Map<string, string>();
  const imageByParkDedupKey = new Map<string, string>();

  for (const coaster of rows) {
    if (!coaster.image_url) continue;
    const qid = coaster.wikidata_id?.trim().toUpperCase();
    if (qid && !imageByWikidataId.has(qid)) {
      imageByWikidataId.set(qid, coaster.image_url);
    }
    const dedupName = normalizeCoasterDedupKey(coaster.name);
    if (dedupName) {
      const key = `${coaster.park_id}:${dedupName}`;
      if (!imageByParkDedupKey.has(key)) imageByParkDedupKey.set(key, coaster.image_url);
    }
  }

  return rows.map((coaster) => {
    if (coaster.image_url) return coaster;
    const qid = coaster.wikidata_id?.trim().toUpperCase();
    const wikidataImage = qid ? imageByWikidataId.get(qid) : undefined;
    if (wikidataImage) return { ...coaster, image_url: wikidataImage };
    const dedupName = normalizeCoasterDedupKey(coaster.name);
    const parkFallback = dedupName
      ? imageByParkDedupKey.get(`${coaster.park_id}:${dedupName}`)
      : undefined;
    if (parkFallback) return { ...coaster, image_url: parkFallback };
    return coaster;
  });
}

function imageUrlFromWikidataEntity(entity: unknown): string | null {
  if (!entity || typeof entity !== "object") return null;
  const claims = (entity as { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }).claims;
  const p18 = claims?.P18;
  if (!Array.isArray(p18) || p18.length === 0) return null;
  for (const claim of p18) {
    const raw = claim?.mainsnak?.datavalue?.value;
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const commonsUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(raw)}`;
    const safe = sanitizeCoasterImageUrl(commonsUrl);
    if (safe) return safe;
  }
  return null;
}

async function hydrateMissingMapImagesFromWikidata(rows: Coaster[]): Promise<Coaster[]> {
  const missingQids = [
    ...new Set(
      rows
        .filter((coaster) => !coaster.image_url)
        .map((coaster) => coaster.wikidata_id?.trim().toUpperCase())
        .filter((qid): qid is string => Boolean(qid)),
    ),
  ].slice(0, 200);
  if (missingQids.length === 0) return rows;

  const imageByQid = new Map<string, string>();
  const chunkSize = 50;
  for (let i = 0; i < missingQids.length; i += chunkSize) {
    const chunk = missingQids.slice(i, i + chunkSize);
    const ids = chunk.join("|");
    const endpoint =
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${encodeURIComponent(ids)}&origin=*`;
    try {
      const res = await fetch(endpoint);
      if (!res.ok) continue;
      const payload = (await res.json()) as { entities?: Record<string, unknown> };
      const entities = payload.entities ?? {};
      for (const qid of chunk) {
        const imageUrl = imageUrlFromWikidataEntity(entities[qid]);
        if (imageUrl) imageByQid.set(qid, imageUrl);
      }
    } catch {
      // non-blocking fallback; keep original rows when Wikidata fetch fails
    }
  }

  if (imageByQid.size === 0) return rows;

  return rows.map((coaster) => {
    if (coaster.image_url) return coaster;
    const qid = coaster.wikidata_id?.trim().toUpperCase();
    if (!qid) return coaster;
    const imageUrl = imageByQid.get(qid);
    return imageUrl ? { ...coaster, image_url: imageUrl } : coaster;
  });
}

// Per-session cache for local catalog image hints to avoid repeat API calls on map reloads.
const LOCAL_IMAGE_HINT_CACHE = new Map<number, string | null>();

async function hydrateMissingMapImagesFromLocalCatalog(
  rows: Coaster[],
  parks: Park[],
): Promise<Coaster[]> {
  const parkById = new Map(parks.map((park) => [park.id, park]));
  const missingRows = rows.filter((coaster) => !coaster.image_url);
  if (missingRows.length === 0) return rows;

  const imageMap = new Map<number, string>();
  const items = missingRows
    .filter((coaster) => {
      if (!LOCAL_IMAGE_HINT_CACHE.has(coaster.id)) return true;
      const cached = LOCAL_IMAGE_HINT_CACHE.get(coaster.id);
      if (cached) imageMap.set(coaster.id, cached);
      return false;
    })
    .map((coaster) => ({
      coasterId: coaster.id,
      wikidataId: coaster.wikidata_id ?? null,
      name: coaster.name,
      parkName: parkById.get(coaster.park_id)?.name ?? null,
    }));
  if (items.length === 0) {
    if (imageMap.size === 0) return rows;
    return rows.map((coaster) => {
      if (coaster.image_url) return coaster;
      const image = imageMap.get(coaster.id);
      return image ? { ...coaster, image_url: image } : coaster;
    });
  }

  try {
    const response = await fetch("/api/catalog/image-hints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) return rows;
    const payload = (await response.json()) as {
      imagesByCoasterId?: Record<string, string>;
    };
    for (const [key, value] of Object.entries(payload.imagesByCoasterId ?? {})) {
      const id = Number(key);
      if (Number.isFinite(id) && value) imageMap.set(id, value);
    }
    for (const item of items) {
      LOCAL_IMAGE_HINT_CACHE.set(item.coasterId, imageMap.get(item.coasterId) ?? null);
    }
    if (imageMap.size === 0) return rows;
    return rows.map((coaster) => {
      if (coaster.image_url) return coaster;
      const image = imageMap.get(coaster.id);
      return image ? { ...coaster, image_url: image } : coaster;
    });
  } catch {
    return rows;
  }
}

function isLikelyPlaceholderParkName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "other" || n === "unknown" || n === "n/a" || n === "na" || n === "misc";
}

function isUnknownHistoricalParkName(name: string): boolean {
  return /^unknown\s*\/\s*historical park/i.test(name.trim());
}

function displayCountryForPark(park: Park | null | undefined): string {
  if (!park) return "Unknown";
  if (isLikelyPlaceholderParkName(park.name) || isUnknownHistoricalParkName(park.name)) {
    return "Unknown";
  }
  const resolved = reconcileCountryWithCoords(park.country, park.latitude ?? null, park.longitude ?? null).trim();
  return resolved || "Unknown";
}

function coasterDataRichness(c: Coaster): number {
  let score = 0;
  if (c.image_url) score += 1;
  if (c.manufacturer) score += 1;
  if (c.length_ft != null) score += 1;
  if (c.speed_mph != null) score += 1;
  if (c.height_ft != null) score += 1;
  if (c.duration_s != null) score += 1;
  if (c.inversions != null) score += 1;
  return score;
}

function parkQualityForQidDedup(parkName: string | null | undefined): number {
  const name = (parkName ?? "").trim();
  if (!name) return 0;
  if (isLikelyPlaceholderParkName(name)) return 1;
  if (isUnknownHistoricalParkName(name)) return 2;
  return 5;
}

function isPlaceholderLikeParkName(name: string | null | undefined): boolean {
  const parkName = (name ?? "").trim();
  return isLikelyPlaceholderParkName(parkName) || isUnknownHistoricalParkName(parkName);
}

function approxEqual(a: number | null | undefined, b: number | null | undefined, tolerance: number): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

function likelySameRideAcrossParks(a: Coaster, b: Coaster): boolean {
  const aKey = normalizeCoasterDedupKey(a.name);
  const bKey = normalizeCoasterDedupKey(b.name);
  if (!aKey || aKey !== bKey) return false;

  const aQid = a.wikidata_id?.trim().toUpperCase() ?? null;
  const bQid = b.wikidata_id?.trim().toUpperCase() ?? null;
  if (aQid && bQid && aQid !== bQid) return false;

  const manufacturerMatch =
    Boolean(a.manufacturer && b.manufacturer) &&
    a.manufacturer!.trim().toLowerCase() === b.manufacturer!.trim().toLowerCase();

  const inversionsMatch =
    a.inversions != null && b.inversions != null && a.inversions === b.inversions;
  const speedMatch = approxEqual(a.speed_mph, b.speed_mph, 3);
  const heightMatch = approxEqual(a.height_ft, b.height_ft, 12);
  const lengthMatch = approxEqual(a.length_ft, b.length_ft, 260);
  const metricMatches = [inversionsMatch, speedMatch, heightMatch, lengthMatch].filter(Boolean).length;

  // Require more than just name overlap to avoid collapsing genuine different rides with common names.
  if (aQid && bQid && aQid === bQid) return true;
  if (manufacturerMatch && metricMatches >= 1) return true;
  return metricMatches >= 2;
}

function preferCoasterForCrossParkWikidataDedup(
  a: Coaster,
  aParkName: string | null | undefined,
  b: Coaster,
  bParkName: string | null | undefined,
): Coaster {
  const parkScoreA = parkQualityForQidDedup(aParkName);
  const parkScoreB = parkQualityForQidDedup(bParkName);
  if (parkScoreA !== parkScoreB) return parkScoreA > parkScoreB ? a : b;

  const dataScoreA = coasterDataRichness(a);
  const dataScoreB = coasterDataRichness(b);
  if (dataScoreA !== dataScoreB) return dataScoreA >= dataScoreB ? a : b;

  return a.id <= b.id ? a : b;
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

const NON_DISTINCTIVE_LOCATION_TOKENS = new Set([
  "hong",
  "kong",
  "north",
  "south",
  "east",
  "west",
  "new",
  "city",
  "town",
  "county",
  "state",
  "province",
  "region",
  "district",
  "island",
  "islands",
  "park",
  "parks",
  "theme",
  "amusement",
  "resort",
  "world",
  "land",
  "the",
  "and",
]);

function tokenizeParkName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function hasSharedDistinctiveParkToken(a: string, b: string): boolean {
  const aTokens = new Set(
    tokenizeParkName(a).filter((token) => !NON_DISTINCTIVE_LOCATION_TOKENS.has(token)),
  );
  if (aTokens.size === 0) return false;
  for (const token of tokenizeParkName(b)) {
    if (!NON_DISTINCTIVE_LOCATION_TOKENS.has(token) && aTokens.has(token)) {
      return true;
    }
  }
  return false;
}

export default function MapPage() {
  const searchParams = useSearchParams();
  const deepLinkedView = useMemo<ViewMode | null>(() => {
    const raw = searchParams.get("view");
    if (raw === "map" || raw === "list") return raw;
    return null;
  }, [searchParams]);
  const deepLinkedCoasterId = useMemo(() => {
    const raw = searchParams.get("coaster");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);
  const deepLinkedParkId = useMemo(() => {
    const raw = searchParams.get("park");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);
  const hasAppliedDeepLink = useRef(false);
  const [parks, setParks] = useState<Park[]>([]);
  const [coasters, setCoasters] = useState<Coaster[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [continent, setContinent] = useState<Continent>("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [parkFilter, setParkFilter] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCoasterId, setSelectedCoasterId] = useState<number | null>(null);
  const [focusedParkId, setFocusedParkId] = useState<number | null>(null);
  const [includeFamilyRides, setIncludeFamilyRides] = useState(true);
  const [includeUnknownHistoricalParks, setIncludeUnknownHistoricalParks] = useState(false);
  const [listVisibleRideCount, setListVisibleRideCount] = useState(INITIAL_LIST_VISIBLE_RIDES);
  const { units, setUnits } = useUnits();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setCatalogLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { parks: fixedParks, coasters: loadedCoasters } = await loadMapCatalog(supabase);
        if (cancelled) return;
        if (fixedParks.length > 0) setParks(fixedParks);
        if (loadedCoasters.length > 0) {
          const withCatalogFallbacks = fillMissingMapImages(loadedCoasters);
          // Render catalog data immediately; image hydration can continue in the background.
          setCoasters(withCatalogFallbacks);

          void (async () => {
            const hydratedFromWikidata =
              await hydrateMissingMapImagesFromWikidata(withCatalogFallbacks);
            const hydrated = await hydrateMissingMapImagesFromLocalCatalog(
              hydratedFromWikidata,
              fixedParks,
            );
            if (!cancelled) {
              setCoasters(hydrated);
              storeMapCatalogCache(fixedParks, hydrated);
            }
          })();
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Wikidata sometimes creates a park row named like "Alton, Staffordshire, England" from a
  // centroid — wrong pin next to "Alton Towers". Merge into the real resort and remap coasters.
  const geoAbsorb = useMemo(() => absorbReverseGeocodeParks(parks), [parks]);

  // Merge duplicate parks from different sync sources (e.g. centroid vs resort name).
  // Exact same name: allow a wide radius (bad coords / different geocoders).
  // Fuzzy name match: allow a moderate radius — Wikidata/OSM vs other geocoders can differ by km.
  const deduplicatedParks = useMemo(() => {
    const canonical = new Map<number, Park>(); // canonical id → merged park
    const idRemap = new Map<number, number>(); // duplicate id → canonical id

    function distanceKm(a: Park, b: Park) {
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

    function mergeInto(base: Park, duplicate: Park) {
      idRemap.set(duplicate.id, base.id);
      if (duplicate.name.length > base.name.length) {
        base.name = duplicate.name;
      }
      base.latitude = duplicate.latitude ?? base.latitude;
      base.longitude = duplicate.longitude ?? base.longitude;
      const lat = base.latitude ?? null;
      const lng = base.longitude ?? null;
      base.country = reconcileCountryWithCoords(base.country ?? duplicate.country, lat, lng);
    }

    for (const park of geoAbsorb.parks) {
      if (idRemap.has(park.id)) continue;

      canonical.set(park.id, { ...park });

      for (const [, existing] of canonical) {
        if (existing.id === park.id) continue;
        if (idRemap.has(existing.id)) continue;

        const sameName =
          existing.name.toLowerCase().trim() === park.name.toLowerCase().trim();
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
  }, [geoAbsorb.parks]);

  const rawParkById = useMemo(() => new Map(parks.map((p) => [p.id, p])), [parks]);
  const dedupedParkById = useMemo(
    () => new Map(deduplicatedParks.parks.map((p) => [p.id, p])),
    [deduplicatedParks.parks],
  );

  const remappedCoasters = useMemo(() => {
    const geo = geoAbsorb.idRemap;
    const dedupe = deduplicatedParks.idRemap;
    const afterRemap = coasters.map((c) => {
      let pid = c.park_id;
      const g = geo.get(pid);
      if (g !== undefined) pid = g;
      const d = dedupe.get(pid);
      if (d !== undefined) pid = d;
      return pid !== c.park_id ? { ...c, park_id: pid } : c;
    });
    // If a coaster still references a removed geocode row, snap to nearest visible pin by distance.
    return snapOrphanCoastersToDisplayParks(afterRemap, deduplicatedParks.parks, rawParkById);
  }, [
    coasters,
    geoAbsorb.idRemap,
    deduplicatedParks.idRemap,
    deduplicatedParks.parks,
    rawParkById,
  ]);

  const coasterEntries = useMemo(() => {
    const mappedCoasters = remappedCoasters.filter((c) => {
      if (isPlaceholderCoasterName(c.name)) return false;
      const parkName = dedupedParkById.get(c.park_id)?.name ?? null;
      if (
        !includeUnknownHistoricalParks &&
        (isUnknownHistoricalParkName(parkName ?? "") || isLikelyPlaceholderParkName(parkName ?? ""))
      ) {
        return false;
      }
      return !isLikelyWaterParkName(parkName);
    });
    return mappedCoasters.filter((c) => {
      const parkName = dedupedParkById.get(c.park_id)?.name ?? null;
      return isLikelyCoasterEntry(c, parkName);
    });
  }, [includeUnknownHistoricalParks, remappedCoasters, dedupedParkById]);

  const visibleCoasters = useMemo(() => {
    const preferredByWikidataId = new Map<string, Coaster>();
    for (const coaster of coasterEntries) {
      const qid = coaster.wikidata_id?.trim().toUpperCase();
      if (!qid) continue;
      const existing = preferredByWikidataId.get(qid);
      if (!existing) {
        preferredByWikidataId.set(qid, coaster);
        continue;
      }
      preferredByWikidataId.set(
        qid,
        preferCoasterForCrossParkWikidataDedup(
          existing,
          dedupedParkById.get(existing.park_id)?.name ?? null,
          coaster,
          dedupedParkById.get(coaster.park_id)?.name ?? null,
        ),
      );
    }
    const crossParkDedupedEntries = coasterEntries.filter((coaster) => {
      const qid = coaster.wikidata_id?.trim().toUpperCase();
      if (!qid) return true;
      const preferred = preferredByWikidataId.get(qid);
      return !preferred || preferred.id === coaster.id;
    });

    const knownByDedupKey = new Map<string, Coaster[]>();
    for (const coaster of crossParkDedupedEntries) {
      const parkName = dedupedParkById.get(coaster.park_id)?.name ?? null;
      if (isPlaceholderLikeParkName(parkName)) continue;
      const key = normalizeCoasterDedupKey(coaster.name);
      if (!key) continue;
      const list = knownByDedupKey.get(key) ?? [];
      list.push(coaster);
      knownByDedupKey.set(key, list);
    }

    const withoutPlaceholderDupes = crossParkDedupedEntries.filter((coaster) => {
      const parkName = dedupedParkById.get(coaster.park_id)?.name ?? null;
      if (!isPlaceholderLikeParkName(parkName)) return true;
      const key = normalizeCoasterDedupKey(coaster.name);
      if (!key) return true;
      const knownCandidates = knownByDedupKey.get(key) ?? [];
      return !knownCandidates.some((known) => likelySameRideAcrossParks(coaster, known));
    });

    if (includeFamilyRides) return withoutPlaceholderDupes;
    return withoutPlaceholderDupes.filter((c) => {
      const parkName = dedupedParkById.get(c.park_id)?.name ?? null;
      return isThrillCoaster(c, parkName);
    });
  }, [coasterEntries, dedupedParkById, includeFamilyRides]);

  const visibleParkIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of coasterEntries) ids.add(c.park_id);
    return ids;
  }, [coasterEntries]);

  const candidateParks = useMemo(() => {
    return deduplicatedParks.parks.filter((park) => {
      if (!visibleParkIds.has(park.id)) return false;

      const placeholderLike =
        isLikelyPlaceholderParkName(park.name) || isUnknownHistoricalParkName(park.name);
      if (viewMode === "list") {
        if (!includeUnknownHistoricalParks && placeholderLike) return false;
        return true;
      }

      if (
        park.latitude == null ||
        park.longitude == null ||
        !Number.isFinite(park.latitude) ||
        !Number.isFinite(park.longitude)
      ) {
        return false;
      }
      if (park.latitude === 0 && park.longitude === 0) return false;
      // Keep map pins focused on named venues.
      if (isLikelyPlaceholderParkName(park.name)) return false;
      return continent === "All" || getParkContinent(park) === continent;
    });
  }, [continent, deduplicatedParks, includeUnknownHistoricalParks, viewMode, visibleParkIds]);

  const countryOptions = useMemo(() => {
    return Array.from(
      new Set(
        candidateParks
          .map((park) => displayCountryForPark(park))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [candidateParks]);

  const parkOptions = useMemo(() => {
    const activeCountryFilter = viewMode === "list" ? countryFilter : "All";
    return candidateParks
      .filter((park) => {
        const resolvedCountry = displayCountryForPark(park);
        return activeCountryFilter === "All" || resolvedCountry === activeCountryFilter;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [candidateParks, countryFilter, viewMode]);

  useEffect(() => {
    if (parkFilter == null) return;
    if (!parkOptions.some((park) => park.id === parkFilter)) {
      setParkFilter(null);
    }
  }, [parkFilter, parkOptions]);

  const filteredParks = useMemo(() => {
    const activeParkFilter = viewMode === "list" ? parkFilter : null;
    return parkOptions.filter((park) => {
      if (activeParkFilter != null && park.id !== activeParkFilter) return false;
      const bySearch =
        matchesSearchQuery(park.name, search) ||
        visibleCoasters
          .filter((c) => c.park_id === park.id)
          .some((c) => matchesSearchQuery(c.name, search));
      return bySearch;
    });
  }, [parkOptions, parkFilter, search, viewMode, visibleCoasters]);

  const filteredParkIds = useMemo(() => new Set(filteredParks.map((park) => park.id)), [filteredParks]);

  const coasterNameMatches = useMemo(() => {
    const q = search.trim();
    if (!q) return new Set<number>();
    const ids = new Set<number>();
    for (const coaster of visibleCoasters) {
      if (matchesSearchQuery(coaster.name, q)) ids.add(coaster.id);
    }
    return ids;
  }, [search, visibleCoasters]);

  const hasCoasterNameMatches = coasterNameMatches.size > 0;

  const dedupLookupKeysByCoasterId = useMemo(() => {
    const byId = new Map<number, string[]>();
    for (const coaster of visibleCoasters) {
      byId.set(coaster.id, coasterDedupLookupKeys(coaster));
    }
    return byId;
  }, [visibleCoasters]);

  const rideOptions = useMemo<RideOption[]>(() => {
    const deduped = new Map<string, Coaster>();
    const keysFor = (coaster: Coaster) =>
      dedupLookupKeysByCoasterId.get(coaster.id) ?? coasterDedupLookupKeys(coaster);
    const findExisting = (c: Coaster): Coaster | undefined => {
      for (const k of keysFor(c)) {
        const hit = deduped.get(k);
        if (hit) return hit;
      }
      return undefined;
    };
    const assignAllKeys = (c: Coaster, value: Coaster) => {
      for (const k of keysFor(c)) deduped.set(k, value);
    };
    const allKeysForPair = (a: Coaster, b: Coaster, merged: Coaster) => {
      const keys = new Set<string>();
      for (const k of keysFor(a)) keys.add(k);
      for (const k of keysFor(b)) keys.add(k);
      for (const k of keysFor(merged)) keys.add(k);
      return keys;
    };

    for (const coaster of visibleCoasters) {
      if (!filteredParkIds.has(coaster.park_id)) continue;
      if (search.trim()) {
        if (hasCoasterNameMatches) {
          if (!coasterNameMatches.has(coaster.id)) continue;
        } else {
          const parkName = dedupedParkById.get(coaster.park_id)?.name ?? "";
          if (!matchesSearchQuery(parkName, search)) continue;
        }
      }
      const existing = findExisting(coaster);
      const merged = existing ? preferCoasterForDedup(existing, coaster) : coaster;
      let withImage = merged;
      if (!merged.image_url) {
        const imageSource = [existing, coaster].find((row) => Boolean(row?.image_url));
        if (imageSource?.image_url) withImage = { ...merged, image_url: imageSource.image_url };
      }
      const keysToSet = existing
        ? allKeysForPair(existing, coaster, withImage)
        : new Set(keysFor(withImage));
      for (const k of keysToSet) deduped.set(k, withImage);
    }

    const uniqueCoasters = [...new Map([...deduped.values()].map((c) => [c.id, c])).values()];

    return uniqueCoasters
      .filter((coaster) => filteredParkIds.has(coaster.park_id))
      .map((coaster) => {
        const park = dedupedParkById.get(coaster.park_id);
        const country = displayCountryForPark(park);
        return {
          coaster,
          parkName: park?.name ?? "Unknown park",
          country,
        };
      })
      .sort((a, b) => {
        const byCountry = a.country.localeCompare(b.country);
        if (byCountry !== 0) return byCountry;
        const byRide = cleanCoasterName(a.coaster.name).localeCompare(cleanCoasterName(b.coaster.name));
        if (byRide !== 0) return byRide;
        return a.parkName.localeCompare(b.parkName);
      });
  }, [
    visibleCoasters,
    dedupedParkById,
    filteredParkIds,
    search,
    hasCoasterNameMatches,
    coasterNameMatches,
    dedupLookupKeysByCoasterId,
  ]);

  const visibleRideOptions = useMemo(
    () => rideOptions.slice(0, listVisibleRideCount),
    [rideOptions, listVisibleRideCount],
  );

  const hasMoreListRides = visibleRideOptions.length < rideOptions.length;

  const listCountryGroups = useMemo(() => {
    const by = new Map<string, { items: RideOption[]; totalCount: number }>();
    for (const opt of rideOptions) {
      const key = opt.country || "Unknown";
      const existing = by.get(key);
      if (existing) existing.totalCount += 1;
      else by.set(key, { items: [], totalCount: 1 });
    }
    for (const opt of visibleRideOptions) {
      const key = opt.country || "Unknown";
      const existing = by.get(key) ?? { items: [], totalCount: 0 };
      existing.items.push(opt);
      by.set(key, existing);
    }
    const keys = [...by.keys()].sort((a, b) => a.localeCompare(b));
    return keys
      .map((country) => ({ country, items: by.get(country)!.items, totalCount: by.get(country)!.totalCount }))
      .filter((group) => group.items.length > 0);
  }, [rideOptions, visibleRideOptions]);

  useEffect(() => {
    if (selectedCoasterId == null) return;
    if (rideOptions.some((o) => o.coaster.id === selectedCoasterId)) return;
    const missing = visibleCoasters.find((c) => c.id === selectedCoasterId);
    if (!missing) return;
    const missingKeys = new Set(dedupLookupKeysByCoasterId.get(missing.id) ?? coasterDedupLookupKeys(missing));
    const replacement = rideOptions.find((o) => {
      const keys = dedupLookupKeysByCoasterId.get(o.coaster.id) ?? coasterDedupLookupKeys(o.coaster);
      return keys.some((k) => missingKeys.has(k));
    });
    if (replacement) setSelectedCoasterId(replacement.coaster.id);
  }, [rideOptions, selectedCoasterId, visibleCoasters, dedupLookupKeysByCoasterId]);

  function applyListCountryFilter(countryLabel: string) {
    setListVisibleRideCount(INITIAL_LIST_VISIBLE_RIDES);
    if (!countryLabel || countryLabel === "Unknown") {
      setCountryFilter("All");
    } else {
      setCountryFilter(countryLabel);
    }
    setParkFilter(null);
  }

  const selectedCoaster = useMemo(
    () => rideOptions.find((option) => option.coaster.id === selectedCoasterId)?.coaster ?? null,
    [rideOptions, selectedCoasterId],
  );

  const activeParkId = selectedCoaster?.park_id ?? focusedParkId;

  /** Full-catalog park for the selected ride so the map can still fly/highlight if markers are filtered. */
  const focusParkForMap = useMemo(() => {
    if (selectedCoaster != null) {
      return dedupedParkById.get(selectedCoaster.park_id) ?? null;
    }
    if (focusedParkId != null) {
      return dedupedParkById.get(focusedParkId) ?? null;
    }
    return null;
  }, [dedupedParkById, focusedParkId, selectedCoaster]);

  useEffect(() => {
    if (selectedCoasterId == null) return;
    const stillVisible = visibleCoasters.some((coaster) => coaster.id === selectedCoasterId);
    if (!stillVisible) setSelectedCoasterId(null);
  }, [visibleCoasters, selectedCoasterId]);

  useEffect(() => {
    if (hasAppliedDeepLink.current) return;
    if (deepLinkedCoasterId == null && deepLinkedParkId == null) return;
    if (coasters.length === 0 || deduplicatedParks.parks.length === 0) return;

    hasAppliedDeepLink.current = true;
    const canonicalParkId =
      deepLinkedParkId != null ? (deduplicatedParks.idRemap.get(deepLinkedParkId) ?? deepLinkedParkId) : null;

    setViewMode(deepLinkedView ?? (canonicalParkId != null ? "list" : "map"));

    if (deepLinkedCoasterId != null) {
      const matchedCoaster = coasters.find((coaster) => coaster.id === deepLinkedCoasterId);
      if (!matchedCoaster) return;
      setSelectedCoasterId(matchedCoaster.id);
      setFocusedParkId(matchedCoaster.park_id);
      return;
    }

    if (canonicalParkId != null) {
      setSelectedCoasterId(null);
      setFocusedParkId(canonicalParkId);
      setParkFilter(canonicalParkId);
      setListVisibleRideCount(INITIAL_LIST_VISIBLE_RIDES);
    }
  }, [coasters, deduplicatedParks, deepLinkedCoasterId, deepLinkedParkId, deepLinkedView]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Coaster map</h1>
        {catalogLoading ? (
          <MapPageCatalogSkeleton
            viewMode={viewMode}
            setViewMode={setViewMode}
            units={units}
            setUnits={setUnits}
          />
        ) : (
        <div className="mb-4 flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setListVisibleRideCount(INITIAL_LIST_VISIBLE_RIDES);
              }}
              placeholder="Search by park or coaster…"
              aria-label="Search by park or coaster"
              className="w-full min-w-0 rounded border border-slate-300 px-3 py-2 sm:w-80"
            />
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("map")}
                aria-pressed={viewMode === "map"}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "map"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Map
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("list");
                  setListVisibleRideCount(INITIAL_LIST_VISIBLE_RIDES);
                }}
                aria-pressed={viewMode === "list"}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                List
              </button>
            </div>
            <div className="w-full overflow-x-auto sm:ml-auto sm:w-auto">
              <div className="inline-block min-w-max">
                <UnitsToggle units={units} onChange={setUnits} />
              </div>
            </div>
          </div>
          {viewMode === "list" ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1 text-sm text-slate-700 sm:w-60">
                <span className="font-medium">Country</span>
                <select
                  value={countryFilter}
                  onChange={(e) => {
                    setCountryFilter(e.target.value);
                    setParkFilter(null);
                    setListVisibleRideCount(INITIAL_LIST_VISIBLE_RIDES);
                  }}
                  aria-label="Filter parks by country"
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="All">All countries</option>
                  {countryOptions.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700 sm:w-72">
                <span className="font-medium">Park</span>
                <select
                  value={parkFilter?.toString() ?? ""}
                  onChange={(e) => {
                    setParkFilter(e.target.value ? Number(e.target.value) : null);
                    setListVisibleRideCount(INITIAL_LIST_VISIBLE_RIDES);
                  }}
                  aria-label="Filter by park"
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">All parks</option>
                  {parkOptions.map((park) => (
                    <option key={park.id} value={park.id}>
                      {park.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {viewMode === "map" ? (
            <div className="flex gap-1 flex-wrap">
              {CONTINENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setContinent(c)}
                  aria-pressed={continent === c}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    continent === c
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 text-slate-600 hover:border-slate-500"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeFamilyRides}
              onChange={(e) => {
                setIncludeFamilyRides(e.target.checked);
                setListVisibleRideCount(INITIAL_LIST_VISIBLE_RIDES);
              }}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-400"
            />
            Show kiddie / family-style rides
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeUnknownHistoricalParks}
              onChange={(e) => {
                setIncludeUnknownHistoricalParks(e.target.checked);
                setListVisibleRideCount(INITIAL_LIST_VISIBLE_RIDES);
              }}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-400"
            />
            Include unknown / historical park entries
          </label>
          <p className="text-xs text-slate-500">
            Data quality note: ride and park details can be incomplete or outdated while upstream sources are refreshed.
          </p>
        </div>
        )}
        {!catalogLoading && deduplicatedParks.parks.length === 0 && (
          <p className="mb-2 text-sm text-slate-600">No parks in the catalog yet.</p>
        )}
        {!catalogLoading && viewMode === "map" ? (
          <ParkMap
            parks={filteredParks}
            coasters={coasterEntries}
            units={units}
            continent={continent}
            selectedCoasterId={selectedCoasterId}
            selectedParkId={activeParkId}
            focusPark={focusParkForMap}
            onCoasterSelect={setSelectedCoasterId}
          />
        ) : null}
        {!catalogLoading && viewMode === "list" ? (
          <section className="rounded border border-slate-200 bg-white">
            {rideOptions.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No rides match the current filters.</p>
            ) : (
              <div>
                {listCountryGroups.map(({ country, items, totalCount }) => {
                  const headerActive = country !== "Unknown" && countryFilter === country;
                  return (
                    <div key={country} className="border-b border-slate-100 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => applyListCountryFilter(country)}
                          title="Filter parks to this country"
                          className={`text-left text-sm font-semibold transition-colors ${
                            headerActive
                              ? "text-amber-700"
                              : "text-slate-800 hover:text-amber-700 hover:underline"
                          }`}
                        >
                          {country}
                        </button>
                        <span className="text-xs text-slate-500">
                          {items.length}
                          {totalCount !== items.length ? ` / ${totalCount}` : ""} rides
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {items.map(({ coaster, parkName }) => {
                          const rideType = effectiveCoasterType(
                            coaster.coaster_type,
                            coaster.manufacturer ?? null,
                          );
                          const lifecycle = normalizeLifecycleStatus(coaster.status, {
                            closingYear: coaster.closing_year,
                          });
                          const isDefunct = lifecycle === "Defunct";
                          const len = fmtLength(coaster.length_ft, units);
                          const spd = fmtSpeed(coaster.speed_mph, units);
                          const ht = fmtHeight(coaster.height_ft, units);
                          const dur = fmtDuration(coaster.duration_s);
                          const stats = [len, spd, ht ? `${ht} tall` : null, dur].filter(Boolean);
                          const isSelected = selectedCoasterId === coaster.id;
                          return (
                            <article
                              key={coaster.id}
                              className={`flex flex-col gap-3 p-3 sm:flex-row sm:items-start ${
                                isSelected ? "bg-amber-50/80" : ""
                              }`}
                            >
                              <CoasterThumbnail
                                name={cleanCoasterName(coaster.name)}
                                imageUrl={coaster.image_url}
                                sizeClassName="h-14 w-14"
                                onPreview={undefined}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h2 className="truncate text-base font-semibold text-slate-900">
                                      {cleanCoasterName(coaster.name)}
                                    </h2>
                                    <p className="text-sm text-slate-500">{parkName}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFocusedParkId(coaster.park_id);
                                      setSelectedCoasterId(null);
                                      setViewMode("map");
                                    }}
                                    className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                                  >
                                    Show on map
                                  </button>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {rideType !== "Unknown" && (
                                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                      {rideType}
                                    </span>
                                  )}
                                  {coaster.manufacturer && (
                                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                      {coaster.manufacturer}
                                    </span>
                                  )}
                                  {isDefunct && (
                                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                                      Defunct{coaster.closing_year ? ` · ${coaster.closing_year}` : ""}
                                    </span>
                                  )}
                                </div>
                                {stats.length > 0 && (
                                  <p className="mt-1 text-xs text-slate-500">{stats.join(" · ")}</p>
                                )}
                                <CoasterActions coasterId={coaster.id} disableWishlist={isDefunct} />
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {hasMoreListRides ? (
                  <div className="border-t border-slate-100 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setListVisibleRideCount((count) => count + LOAD_MORE_LIST_RIDES_STEP)}
                      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    >
                      Load more rides
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
