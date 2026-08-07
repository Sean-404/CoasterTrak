import { NextResponse } from "next/server";
import { sanitizeCoasterImageUrl } from "@/lib/coaster-known-fixes";
import { parkNamesMatch } from "@/lib/park-match";
import { loadWikidataCatalogRows } from "@/lib/wikidata-catalog-source";
import { normalizeNameKey } from "@/lib/wikidata-coasters";

export const runtime = "nodejs";

type CatalogRow = {
  wikidataId: string;
  label: string;
  parkLabel: string | null;
  imageUrl: string | null;
};

type RequestItem = {
  coasterId: number;
  wikidataId?: string | null;
  name: string;
  parkName?: string | null;
};

const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;

let cachedAt = 0;
let cachedRows: CatalogRow[] | null = null;
let cachedByQid: Map<string, CatalogRow> | null = null;
let cachedByName: Map<string, CatalogRow[]> | null = null;

async function loadCatalog(): Promise<{
  rows: CatalogRow[];
  byQid: Map<string, CatalogRow>;
  byName: Map<string, CatalogRow[]>;
}> {
  const now = Date.now();
  if (
    cachedRows &&
    cachedByQid &&
    cachedByName &&
    now - cachedAt < CATALOG_CACHE_TTL_MS
  ) {
    return { rows: cachedRows, byQid: cachedByQid, byName: cachedByName };
  }

  // Prefer WIKIDATA_COASTERS_URL (Supabase Storage) over the committed/local snapshot
  // so production image hints stay fresh after monthly refresh jobs.
  const parsed = await loadWikidataCatalogRows({ revalidateSeconds: 3600 });
  const rows: CatalogRow[] = parsed
    .filter((row) => Boolean(row?.label))
    .map((row) => ({
      wikidataId: row.wikidataId,
      label: row.label,
      parkLabel: row.parkLabel,
      imageUrl: row.imageUrl,
    }));

  const byQid = new Map<string, CatalogRow>();
  const byName = new Map<string, CatalogRow[]>();

  for (const row of rows) {
    const qid = row.wikidataId?.trim().toUpperCase();
    if (qid && !byQid.has(qid)) byQid.set(qid, row);

    const key = normalizeNameKey(row.label);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }

  cachedRows = rows;
  cachedByQid = byQid;
  cachedByName = byName;
  cachedAt = now;
  return { rows, byQid, byName };
}

function pickImageFromCandidates(
  candidates: CatalogRow[] | undefined,
  parkName: string | null | undefined,
): string | null {
  if (!candidates || candidates.length === 0) return null;
  const desiredPark = (parkName ?? "").trim();

  if (desiredPark) {
    const exact = candidates.find((row) => {
      const park = (row.parkLabel ?? "").trim();
      return park !== "" && park.toLowerCase() === desiredPark.toLowerCase();
    });
    if (exact?.imageUrl) return sanitizeCoasterImageUrl(exact.imageUrl);

    const fuzzy = candidates.find((row) => parkNamesMatch(desiredPark, row.parkLabel ?? ""));
    if (fuzzy?.imageUrl) return sanitizeCoasterImageUrl(fuzzy.imageUrl);
  }

  const firstWithImage = candidates.find((row) => Boolean(row.imageUrl));
  return sanitizeCoasterImageUrl(firstWithImage?.imageUrl ?? null);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { items?: RequestItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return NextResponse.json({ imagesByCoasterId: {} });

    const { byQid, byName } = await loadCatalog();
    const imagesByCoasterId: Record<string, string> = {};

    for (const item of items.slice(0, 600)) {
      if (!item || typeof item.coasterId !== "number" || !item.name) continue;
      let image: string | null = null;

      const qid = item.wikidataId?.trim().toUpperCase();
      if (qid) {
        const byId = byQid.get(qid);
        image = sanitizeCoasterImageUrl(byId?.imageUrl ?? null);
      }

      if (!image) {
        const candidates = byName.get(normalizeNameKey(item.name));
        image = pickImageFromCandidates(candidates, item.parkName);
      }

      if (image) imagesByCoasterId[String(item.coasterId)] = image;
    }

    return NextResponse.json({ imagesByCoasterId });
  } catch {
    return NextResponse.json({ imagesByCoasterId: {} });
  }
}
