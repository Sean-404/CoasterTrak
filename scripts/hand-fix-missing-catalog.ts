/**
 * Hand-fix the currently visible (undismissed) MISSING_DATA catalog items.
 *
 * Sources (in order):
 *  1) Wikidata claims (P2048/P2052/P2043/P176/P571/P18) for rows with a QID
 *  2) Sibling DB installs of the same ride name (clone hardware)
 *  3) Curated patches for known sparse installs
 *
 *   npx tsx --env-file=.env.local scripts/hand-fix-missing-catalog.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/hand-fix-missing-catalog.ts --apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  applyCatalogQualityDismissals,
  type CatalogQualityDismissals,
  type CatalogQualityReport,
  type CatalogReviewQueue,
} from "../src/lib/catalog-quality-storage";
import { hasFlag, runMain } from "./lib/cli";

const APPLY = hasFlag("--apply");
const UA = "CoasterTrakHandFix/1.0 (https://coastertrak.com; catalog-quality)";

type CoasterRow = {
  id: number;
  name: string;
  park_id: number;
  wikidata_id: string | null;
  manufacturer: string | null;
  coaster_type: string | null;
  status: string | null;
  height_ft: number | null;
  speed_mph: number | null;
  length_ft: number | null;
  opening_year: number | null;
  image_url: string | null;
  enwiki_title: string | null;
  rcdb_id: string | null;
};

type Patch = Partial<
  Pick<
    CoasterRow,
    | "manufacturer"
    | "height_ft"
    | "speed_mph"
    | "length_ft"
    | "opening_year"
    | "image_url"
    | "enwiki_title"
  >
> & { last_synced_at?: string };

/** Curated null-fills for installs Wikidata/Wikipedia leave sparse. Values are imperial. */
const CURATED_BY_DB_ID: Record<number, Patch> = {
  // RMF Dragon / Vekoma SFC 453m @ Energylandia (Coasterpedia / park)
  6077: {
    manufacturer: "Vekoma",
    height_ft: 63,
    speed_mph: 47,
    length_ft: 1486,
    opening_year: 2015,
  },
  // Wandering Oaken's Sliding Sleighs — Vekoma Family Boomerang (HKDL)
  10552: { height_ft: 66, speed_mph: 37 },
  // Hersheypark Wild Cat (1923 PTC) — contemporary published stats
  34: { height_ft: 90, speed_mph: 45 },
  // Michigan's Adventure Big Dipper / Woodstock Express (Chance Big Dipper)
  64: { height_ft: 16, speed_mph: 15, length_ft: 350, opening_year: 1999 },
  // Insane Speed — B&M Floorless @ Janfusun Fancyworld
  15746: { height_ft: 115, speed_mph: 56, length_ft: 2410, opening_year: 2001 },
  // Rollies / Rollie's Coaster @ Morey's Piers
  508: { height_ft: 36, length_ft: 1198, opening_year: 1999 },
  // Super Grover's Box Car Derby — Zierer Force / family coaster clones
  15850: { height_ft: 30, speed_mph: 25, length_ft: 722 },
  15851: { height_ft: 30, speed_mph: 25, length_ft: 722 },
  15852: { height_ft: 30, speed_mph: 25, length_ft: 722 },
  // Gulf Coaster — Herschell Little Dipper kiddie
  15806: { height_ft: 12, speed_mph: 10, length_ft: 300 },
  15807: { height_ft: 12, speed_mph: 10, length_ft: 300 },
  // ThunderVolt @ Playland — Gravity Group woodie
  15863: { manufacturer: "The Gravity Group", speed_mph: 40, opening_year: 2025 },
  // Opening years from park announcements / Wikipedia / Coasterpedia
  15845: { opening_year: 2023 }, // Snoopy's Racing Railway — Canada's Wonderland
  15846: { opening_year: 2025 }, // Snoopy's Racing Railway — Carowinds
  322: { opening_year: 1998 }, // Cosmic Coaster (Valleyfair)
  15774: { opening_year: 1987 }, // Big Thunder Mountain — Tokyo Disneyland
  15775: { opening_year: 1992 }, // Big Thunder Mountain — Disneyland Paris
  // Black Diamond (Knoebels) — indoor PTC junior woodie
  960: { speed_mph: 20, length_ft: 1600 },
  // Cliffhanger (Glenwood Caverns) — relocated Arrow looping coaster from Celebration City
  1025: { length_ft: 2100 },
  15782: { length_ft: 2100 },
  // Astro Storm (Blackpool) — Pinfari Zyklon
  15765: { height_ft: 45 },
  // Seven Dwarfs Mine Train — Magic Kingdom–class height/drop figure
  15842: { height_ft: 41 },
  // Woodstock's Express (CGA)
  4416: { speed_mph: 30 },
  // Jumbo Jet (Schwarzkopf)
  15818: { speed_mph: 42, length_ft: 1903 },
  15816: { speed_mph: 42, length_ft: 1903 },
  15817: { speed_mph: 42, length_ft: 1903, opening_year: 1972 },
  // Hornet
  15811: { speed_mph: 40 },
  // Wild Kitty (Frontier City)
  15873: { speed_mph: 10, length_ft: 300 },
  // Wild West Express — Zamperla powered family
  15874: { opening_year: 2012 },
  15875: { opening_year: 2011 },
  // Fast & Furious: Hollywood Drift
  15789: { height_ft: 72 },
  // Nightmare at Crack Axle Canyon — Beech Bend install
  15831: { opening_year: 2006 },
  // Big Dipper (Luna Park Sydney, 1935) — timber, prior & church / harry g. travers era
  15772: { manufacturer: "LaMarcus Adna Thompson" },
  15773: { manufacturer: "LaMarcus Adna Thompson" },
};

/** Image URL overrides when Wikidata P18 is missing (Wikimedia Commons / known CDNs). */
const CURATED_IMAGES: Record<number, string> = {};

function mToFt(m: number): number {
  return Math.round(m * 3.28084);
}
function msToMph(ms: number): number {
  return Math.round(ms * 2.23693629);
}
function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371);
}

function claimNums(entity: any, prop: string): number[] {
  const claims = entity?.claims?.[prop];
  if (!Array.isArray(claims)) return [];
  const out: number[] = [];
  for (const c of claims) {
    const amount = c?.mainsnak?.datavalue?.value?.amount;
    if (typeof amount === "string") {
      const n = Number(amount);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

function claimYear(entity: any, prop: string): number | null {
  const claims = entity?.claims?.[prop];
  if (!Array.isArray(claims) || !claims[0]) return null;
  const time = claims[0]?.mainsnak?.datavalue?.value?.time as string | undefined;
  if (!time) return null;
  const m = time.match(/^([+-]?\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function claimManufacturerLabel(entity: any, labels: Record<string, string>): string | null {
  const claims = entity?.claims?.P176;
  if (!Array.isArray(claims) || !claims[0]) return null;
  const id = claims[0]?.mainsnak?.datavalue?.value?.id as string | undefined;
  if (!id) return null;
  return labels[id] ?? null;
}

function claimCommonsImage(entity: any): string | null {
  const claims = entity?.claims?.P18;
  if (!Array.isArray(claims) || !claims[0]) return null;
  const file = claims[0]?.mainsnak?.datavalue?.value as string | undefined;
  if (!file?.trim()) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.trim())}`;
}

function claimEnwikiTitle(entity: any): string | null {
  const title = entity?.sitelinks?.enwiki?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

async function fetchWikidataEntities(qids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const unique = [...new Set(qids.map((q) => q.toUpperCase()))];
  for (let i = 0; i < unique.length; i += 40) {
    const batch = unique.slice(i, i + 40);
    const url =
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join("|")}` +
      `&props=claims|sitelinks|labels&languages=en&format=json&origin=*`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) throw new Error(`Wikidata ${res.status}`);
    const json = (await res.json()) as { entities?: Record<string, any> };
    for (const [id, ent] of Object.entries(json.entities ?? {})) {
      out.set(id.toUpperCase(), ent);
    }
  }
  return out;
}

function patchFromWikidata(row: CoasterRow, entity: any, labelByQid: Record<string, string>): Patch {
  const patch: Patch = {};
  if (row.height_ft == null) {
    const h = claimNums(entity, "P2048")[0];
    if (h != null) patch.height_ft = mToFt(h);
  }
  if (row.length_ft == null) {
    const l = claimNums(entity, "P2043")[0];
    if (l != null) patch.length_ft = mToFt(l);
  }
  if (row.speed_mph == null) {
    // P2052 is m/s on Wikidata quantity; some dumps store km/h inconsistently — prefer m/s path.
    const speeds = claimNums(entity, "P2052");
    if (speeds[0] != null) {
      // Heuristic: values > 80 are almost certainly km/h mis-stored as quantityAmount.
      patch.speed_mph = speeds[0] > 80 ? kmhToMph(speeds[0]) : msToMph(speeds[0]);
    }
  }
  if (row.opening_year == null) {
    const y = claimYear(entity, "P571") ?? claimYear(entity, "P1619");
    if (y != null && y >= 1800 && y <= 2100) patch.opening_year = y;
  }
  if (!row.manufacturer?.trim()) {
    const mfr = claimManufacturerLabel(entity, labelByQid);
    if (mfr) patch.manufacturer = mfr;
  }
  if (!row.image_url?.trim()) {
    const img = claimCommonsImage(entity);
    if (img) patch.image_url = img;
  }
  if (!row.enwiki_title?.trim()) {
    const title = claimEnwikiTitle(entity);
    if (title) patch.enwiki_title = title;
  }
  return patch;
}

function mergePatches(...parts: Patch[]): Patch {
  const out: Patch = {};
  for (const p of parts) {
    for (const [k, v] of Object.entries(p)) {
      if (v == null || v === "") continue;
      if ((out as any)[k] == null) (out as any)[k] = v;
    }
  }
  return out;
}

function nullFillPatch(row: CoasterRow, candidate: Patch): Patch {
  const out: Patch = {};
  if (row.height_ft == null && candidate.height_ft != null) out.height_ft = candidate.height_ft;
  if (row.speed_mph == null && candidate.speed_mph != null) out.speed_mph = candidate.speed_mph;
  if (row.length_ft == null && candidate.length_ft != null) out.length_ft = candidate.length_ft;
  if (row.opening_year == null && candidate.opening_year != null) out.opening_year = candidate.opening_year;
  if (!row.manufacturer?.trim() && candidate.manufacturer) out.manufacturer = candidate.manufacturer;
  if (!row.image_url?.trim() && candidate.image_url) out.image_url = candidate.image_url;
  if (!row.enwiki_title?.trim() && candidate.enwiki_title) out.enwiki_title = candidate.enwiki_title;
  return out;
}

async function fetchWikipediaPageImage(title: string): Promise<string | null> {
  try {
    const url =
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      originalimage?: { source?: string };
      thumbnail?: { source?: string };
      type?: string;
    };
    if (json.type === "disambiguation") return null;
    return json.originalimage?.source ?? json.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

async function loadVisibleMissingIds(sb: SupabaseClient): Promise<number[]> {
  async function dl(path: string) {
    const { data, error } = await sb.storage.from("catalog").download(path);
    if (error || !data) return null;
    return JSON.parse(await data.text());
  }
  const report = (await dl("coastertrak-data/latest/report.json")) as CatalogQualityReport;
  const queue = (await dl("coastertrak-data/latest/review-queue.json")) as CatalogReviewQueue;
  const dismissed = (await dl("coastertrak-data/latest/dismissed.json")) as CatalogQualityDismissals;
  const filtered = applyCatalogQualityDismissals(
    { report, reviewQueue: queue },
    new Set(dismissed?.keys ?? []),
  );
  return (filtered.reviewQueue?.items ?? [])
    .filter((i) => i.type === "MISSING_DATA" && typeof i.dbId === "number")
    .map((i) => i.dbId as number);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const sb = createClient(url, key);

  console.error(APPLY ? "Mode: APPLY" : "Mode: dry-run (pass --apply to write)");

  const ids = await loadVisibleMissingIds(sb);
  console.error(`Visible MISSING_DATA ids: ${ids.length}`);
  if (!ids.length) return;

  const { data: rows, error } = await sb
    .from("coasters")
    .select(
      "id,name,park_id,wikidata_id,manufacturer,coaster_type,status,height_ft,speed_mph,length_ft,opening_year,image_url,enwiki_title,rcdb_id",
    )
    .in("id", ids);
  if (error) throw error;

  const targets = (rows ?? []) as CoasterRow[];
  const qids = targets.map((r) => r.wikidata_id).filter((q): q is string => Boolean(q));
  const entities = qids.length ? await fetchWikidataEntities(qids) : new Map();

  // Resolve manufacturer labels referenced by P176
  const mfrQids = new Set<string>();
  for (const ent of entities.values()) {
    const claims = ent?.claims?.P176;
    if (!Array.isArray(claims)) continue;
    for (const c of claims) {
      const id = c?.mainsnak?.datavalue?.value?.id;
      if (typeof id === "string") mfrQids.add(id);
    }
  }
  const mfrEntities = mfrQids.size ? await fetchWikidataEntities([...mfrQids]) : new Map();
  const labelByQid: Record<string, string> = {};
  for (const [id, ent] of mfrEntities) {
    const label = ent?.labels?.en?.value;
    if (typeof label === "string") labelByQid[id] = label;
  }

  // Exact-name clone installs only (do not strip parentheticals — that aliases unrelated Wildcats).
  const names = [...new Set(targets.map((t) => t.name))];
  const { data: siblings } = await sb
    .from("coasters")
    .select("id,name,manufacturer,height_ft,speed_mph,length_ft,opening_year,image_url")
    .in("name", names);
  const siblingsByName = new Map<string, CoasterRow[]>();
  for (const s of (siblings ?? []) as CoasterRow[]) {
    const key = s.name.trim().toLowerCase();
    const list = siblingsByName.get(key) ?? [];
    list.push(s);
    siblingsByName.set(key, list);
  }

  let wouldUpdate = 0;
  let updated = 0;
  const remainingGaps: Array<{ id: number; name: string; still: string[] }> = [];

  for (const row of targets) {
    const parts: Patch[] = [];
    if (row.wikidata_id) {
      const ent = entities.get(row.wikidata_id.toUpperCase());
      if (ent) parts.push(patchFromWikidata(row, ent, labelByQid));
    }
    const curated = CURATED_BY_DB_ID[row.id];
    if (curated) parts.push(curated);
    const img = CURATED_IMAGES[row.id];
    if (img) parts.push({ image_url: img });

    // Exact-name clone sibling fill.
    const sibs = siblingsByName.get(row.name.trim().toLowerCase()) ?? [];
    const donor = sibs.find(
      (s) =>
        s.id !== row.id &&
        (s.height_ft != null || s.speed_mph != null || s.length_ft != null || s.manufacturer),
    );
    if (donor) {
      parts.push({
        height_ft: donor.height_ft ?? undefined,
        speed_mph: donor.speed_mph ?? undefined,
        length_ft: donor.length_ft ?? undefined,
        manufacturer: donor.manufacturer ?? undefined,
      });
    }
    // Borrow images only from exact-name siblings (same ride name string).
    if (!row.image_url?.trim()) {
      const imageDonor = sibs.find((s) => s.id !== row.id && s.image_url?.trim());
      if (imageDonor?.image_url) parts.push({ image_url: imageDonor.image_url });
    }

    const patch = nullFillPatch(row, mergePatches(...parts));

    // If still missing image but we now know an enwiki title, try the page image.
    const titleForImage = patch.enwiki_title ?? row.enwiki_title;
    if (!row.image_url?.trim() && !patch.image_url && titleForImage?.trim()) {
      const pageImage = await fetchWikipediaPageImage(titleForImage);
      if (pageImage) patch.image_url = pageImage;
      await new Promise((r) => setTimeout(r, 120));
    }

    if (Object.keys(patch).length === 0) {
      const still = [
        row.height_ft == null ? "height" : null,
        row.speed_mph == null ? "speed" : null,
        row.length_ft == null ? "length" : null,
        !row.manufacturer?.trim() ? "manufacturer" : null,
        !row.image_url?.trim() ? "image" : null,
        row.opening_year == null ? "opening_year" : null,
      ].filter(Boolean) as string[];
      remainingGaps.push({ id: row.id, name: row.name, still });
      continue;
    }

    wouldUpdate += 1;
    console.log(
      `#${row.id} ${row.name}: ${Object.entries(patch)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );

    if (APPLY) {
      const { error: upErr } = await sb
        .from("coasters")
        .update({ ...patch, last_synced_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) throw new Error(`update ${row.id}: ${upErr.message}`);
      updated += 1;
    }
  }

  console.error(
    `\n${APPLY ? "Updated" : "Would update"} ${APPLY ? updated : wouldUpdate}/${targets.length}; ` +
      `${remainingGaps.length} still fully empty after sources`,
  );
  if (remainingGaps.length) {
    console.error("Still sparse:");
    for (const g of remainingGaps.slice(0, 40)) {
      console.error(`  #${g.id} ${g.name}: ${g.still.join(", ")}`);
    }
  }
}

runMain(main);
