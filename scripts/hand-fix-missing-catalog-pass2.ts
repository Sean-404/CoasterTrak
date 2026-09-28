/**
 * Second pass: fill remaining image/enwiki gaps for known titles.
 * npx tsx --env-file=.env.local scripts/hand-fix-missing-catalog-pass2.ts --apply
 */
import { createClient } from "@supabase/supabase-js";
import { hasFlag, runMain } from "./lib/cli";

const APPLY = hasFlag("--apply");
const UA = "CoasterTrakHandFix/1.0 (https://coastertrak.com; catalog-quality)";

const PATCHES: Record<
  number,
  {
    enwiki_title?: string;
    image_url?: string | null;
    speed_mph?: number;
    length_ft?: number;
    manufacturer?: string;
  }
> = {
  // Clear wrong Canyon Blaster thumb off the Opryland Rock n' Roller Coaster article
  113: { image_url: null },
  // Intimidator 305 was renamed Pantherian
  934: { enwiki_title: "Pantherian" },
  9903: { enwiki_title: "Firebird (roller coaster)" },
  711: { enwiki_title: "Backlot Stunt Coaster" },
  748: { enwiki_title: "Backlot Stunt Coaster" },
  412: { enwiki_title: "Boomerang (Six Flags Fiesta Texas)" }, // Joker's Revenge was a Vekoma Boomerang
  295: { enwiki_title: "Firebird (roller coaster)" }, // Iron Wolf → Firebird lineage
  15776: { enwiki_title: "Bocaraca (roller coaster)" },
  15777: { enwiki_title: "Bocaraca (roller coaster)" },
  15812: { enwiki_title: "Jet Star" },
  15813: { enwiki_title: "Jet Star" },
  15814: { enwiki_title: "Jet Star" },
  15815: { enwiki_title: "Jet Star" },
  15826: { enwiki_title: "Lightnin' Loops" },
  15827: { enwiki_title: "Lightnin' Loops" },
  15626: { enwiki_title: "Montaña Rusa (Parque del Café)" },
  // The Flash: Speed Force is an Intamin Half Pipe (Surfrider) — no reliable published top speed
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

  for (const [idRaw, patch] of Object.entries(PATCHES)) {
    const id = Number(idRaw);
    const { data: row, error } = await sb
      .from("coasters")
      .select("id,name,image_url,enwiki_title,speed_mph,length_ft,manufacturer")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!row) continue;

    const update: Record<string, string | number | null> = {};
    if (patch.enwiki_title && !row.enwiki_title) update.enwiki_title = patch.enwiki_title;
    if (patch.enwiki_title && patch.enwiki_title !== row.enwiki_title) {
      update.enwiki_title = patch.enwiki_title;
    }
    if ("image_url" in patch) {
      if (patch.image_url === null) update.image_url = null;
      else if (patch.image_url) update.image_url = patch.image_url;
    }
    if (patch.speed_mph != null && row.speed_mph == null) update.speed_mph = patch.speed_mph;
    if (patch.length_ft != null && row.length_ft == null) update.length_ft = patch.length_ft;
    if (patch.manufacturer && !row.manufacturer) update.manufacturer = patch.manufacturer;

    const title = (update.enwiki_title as string | undefined) ?? row.enwiki_title ?? patch.enwiki_title;
    const needsImage = (update.image_url === undefined ? !row.image_url : update.image_url === null) || !row.image_url;
    if (needsImage && title && update.image_url !== null) {
      const img = await fetchWikipediaPageImage(title);
      if (img) update.image_url = img;
      await new Promise((r) => setTimeout(r, 150));
    }

    if (Object.keys(update).length === 0) {
      console.log(`#${id} ${row.name}: no changes`);
      continue;
    }
    console.log(`#${id} ${row.name}: ${JSON.stringify(update)}`);
    if (APPLY) {
      const { error: upErr } = await sb
        .from("coasters")
        .update({ ...update, last_synced_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) throw new Error(upErr.message);
    }
  }
}

runMain(main);
