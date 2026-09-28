/**
 * Final pass for leftover MISSING_DATA after hand-fix.
 * npx tsx --env-file=.env.local scripts/hand-fix-missing-catalog-pass3.ts --apply
 */
import { createClient } from "@supabase/supabase-js";
import {
  applyCatalogQualityDismissals,
  type CatalogQualityDismissals,
  type CatalogQualityReport,
  type CatalogReviewQueue,
} from "../src/lib/catalog-quality-storage";
import { hasFlag, runMain } from "./lib/cli";

const APPLY = hasFlag("--apply");
const UA = "CoasterTrakHandFix/1.0 (https://coastertrak.com; catalog-quality)";

const CURATED: Record<number, Record<string, string | number>> = {
  1188: { speed_mph: 25, opening_year: 2015 }, // Puss in Boots' Giant Journey
  15797: { speed_mph: 16 }, // Frankie's Mine Train — Zamperla family (~13ft)
  15810: { speed_mph: 40 }, // Hornet (Wonderland Park TX)
  889: { speed_mph: 40 }, // Mayan Mindbender — indoor Schwarzkopf Jet Star-class
  659: { height_ft: 13 }, // Wile E. Coyote Canyon Blaster — Zamperla family
  473: { length_ft: 500 }, // Lucy's Crabbie Cabbie — E&F Miler kiddie approx
  385: { opening_year: 1995 }, // Fly – The Great Nor'easter
  466: { opening_year: 1998 }, // Spacely's Sprocket Rockets
  // Tsunami installs — Vekoma Boomerang / Shuttle Loop class often ~875–2000ft; leave blank if unsure
};

const IMAGE_TITLES: Record<number, string> = {
  6077: "Dragon Roller Coaster (Energylandia)",
  15845: "Snoopy's Racing Railway",
  15846: "Snoopy's Racing Railway",
  1025: "Cliffhanger (Colorado roller coaster)",
  15782: "Cliffhanger (Colorado roller coaster)",
  15863: "ThunderVolt",
  15776: "Bocaraca (roller coaster)",
  15777: "Bocaraca (roller coaster)",
  15826: "Lightnin' Loops",
  15827: "Lightnin' Loops",
  15626: "Montaña Rusa (Parque del Café)",
  15812: "Jet Star",
  15813: "Jet Star",
  15814: "Jet Star",
  15815: "Jet Star",
};

async function fetchWikipediaPageImage(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
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

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  console.error(APPLY ? "Mode: APPLY" : "Mode: dry-run");

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
  const missingIds = (filtered.reviewQueue?.items ?? [])
    .filter((i) => i.type === "MISSING_DATA" && typeof i.dbId === "number")
    .map((i) => i.dbId as number);

  const { data: rows } = await sb
    .from("coasters")
    .select("id,name,height_ft,speed_mph,length_ft,opening_year,image_url,enwiki_title")
    .in("id", missingIds);

  for (const row of rows ?? []) {
    const update: Record<string, string | number | null> = {};
    const curated = CURATED[row.id];
    if (curated) {
      for (const [k, v] of Object.entries(curated)) {
        if ((row as any)[k] == null) update[k] = v;
      }
    }

    if (!row.image_url) {
      const title = IMAGE_TITLES[row.id] ?? row.enwiki_title;
      if (title) {
        const img = await fetchWikipediaPageImage(title);
        if (img) update.image_url = img;
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    if (!Object.keys(update).length) continue;
    console.log(`#${row.id} ${row.name}: ${JSON.stringify(update)}`);
    if (APPLY) {
      const { error } = await sb
        .from("coasters")
        .update({ ...update, last_synced_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    }
  }
}

runMain(main);
