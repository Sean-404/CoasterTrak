import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { sanitizeCoasterImageUrl } from "@/lib/coaster-known-fixes";
import { parkNamesMatch } from "@/lib/park-match";
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

let cachedRows: CatalogRow[] | null = null;
let cachedByQid: Map<string, CatalogRow> | null = null;
let cachedByName: Map<string, CatalogRow[]> | null = null;

async function loadCatalog(): Promise<{
  rows: CatalogRow[];
  byQid: Map<string, CatalogRow>;
  byName: Map<string, CatalogRow[]>;
}> {
  if (cachedRows && cachedByQid && cachedByName) {
    return { rows: cachedRows, byQid: cachedByQid, byName: cachedByName };
  }

  const path = join(process.cwd(), "data", "wikidata_coasters.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as CatalogRow[];

  const rows = parsed.filter((row) => Boolean(row?.label));
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
