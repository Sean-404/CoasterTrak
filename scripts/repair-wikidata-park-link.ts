/**
 * Repair a mislinked Wikidata coaster row to the correct park by Q-id.
 *
 * Usage:
 *   npx tsx scripts/repair-wikidata-park-link.ts --qid Q137830653 --apply
 *   npx tsx scripts/repair-wikidata-park-link.ts --qid Q137830653   (dry-run)
 */

import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import {
  WIKIDATA_USER_AGENT,
  parseWktPoint,
  parseUriToQid,
  type SparqlJsonBinding,
} from "../src/lib/wikidata-coasters";

const WDQS_URL = "https://query.wikidata.org/sparql?format=json&timeout=120000";

type DbPark = {
  id: number;
  name: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

type DbCoaster = {
  id: number;
  external_source?: string | null;
  name: string;
  park_id: number;
  wikidata_id: string | null;
  external_id: string | null;
  parks: DbPark | null;
};

async function mergeDuplicateCoasterRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  keepId: number,
  dropIds: number[],
) {
  for (const dropId of dropIds) {
    const { data: rides } = await supabase
      .from("rides")
      .select("user_id, coaster_id")
      .eq("coaster_id", dropId);
    for (const r of rides ?? []) {
      await supabase
        .from("rides")
        .upsert(
          { user_id: r.user_id, coaster_id: keepId },
          { onConflict: "user_id,coaster_id", ignoreDuplicates: true },
        );
    }
    await supabase.from("rides").delete().eq("coaster_id", dropId);

    const { data: wishes } = await supabase
      .from("wishlist")
      .select("user_id, coaster_id")
      .eq("coaster_id", dropId);
    for (const w of wishes ?? []) {
      await supabase
        .from("wishlist")
        .upsert(
          { user_id: w.user_id, coaster_id: keepId },
          { onConflict: "user_id,coaster_id", ignoreDuplicates: true },
        );
    }
    await supabase.from("wishlist").delete().eq("coaster_id", dropId);

    const { error: delErr } = await supabase.from("coasters").delete().eq("id", dropId);
    if (delErr) throw delErr;
    console.error(`  Merged duplicate coaster row ${dropId} -> ${keepId}`);
  }
}

function lit(b: SparqlJsonBinding | undefined): string | null {
  if (!b || b.type !== "literal") return null;
  return b.value;
}

function uri(b: SparqlJsonBinding | undefined): string | null {
  if (!b || b.type !== "uri") return null;
  return b.value;
}

async function fetchWikidataContext(qid: string): Promise<{
  qid: string;
  itemLabel: string | null;
  countryLabel: string | null;
  parkLabel: string | null;
  parkQid: string | null;
  lat: number | null;
  lon: number | null;
}> {
  const query = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
PREFIX wikibase: <http://wikiba.se/ontology#>

SELECT ?item ?itemLabel ?coord ?countryLabel ?park ?parkLabel ?parkCoord ?enwiki WHERE {
  VALUES ?item { wd:${qid} }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P361 ?park . }
  OPTIONAL { ?park wdt:P625 ?parkCoord . }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?enwiki .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 1
`;
  const res = await fetch(WDQS_URL, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/sparql-query",
      "User-Agent": WIKIDATA_USER_AGENT,
    },
    body: query,
  });
  if (!res.ok) {
    throw new Error(`WDQS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results?: { bindings?: Record<string, SparqlJsonBinding>[] };
  };
  const b = json.results?.bindings?.[0];
  if (!b) throw new Error(`No Wikidata row found for ${qid}`);

  const coord = parseWktPoint((lit(b.coord) ?? undefined) as string | undefined);
  const parkCoord = parseWktPoint((lit(b.parkCoord) ?? undefined) as string | undefined);
  const itemLabel = lit(b.itemLabel);
  const enwiki = lit(b.enwiki);
  const bestLabel =
    itemLabel && /^Q\d+$/i.test(itemLabel.trim()) ? (enwiki?.trim() || itemLabel) : itemLabel;
  return {
    qid,
    itemLabel: bestLabel,
    countryLabel: lit(b.countryLabel),
    parkLabel: lit(b.parkLabel),
    parkQid: uri(b.park) ? parseUriToQid(uri(b.park)!) : null,
    lat: coord?.lat ?? parkCoord?.lat ?? null,
    lon: coord?.lon ?? parkCoord?.lon ?? null,
  };
}

async function main() {
  const qidRaw = (arg("--qid") ?? "").trim().toUpperCase();
  const qid = qidRaw.startsWith("Q") ? qidRaw : parseUriToQid(qidRaw);
  if (!qid || !qid.startsWith("Q")) {
    throw new Error("Usage: --qid Q12345");
  }
  const apply = hasFlag("--apply");
  const latOverride = arg("--lat") ? parseFloat(arg("--lat")!) : null;
  const lonOverride = arg("--lon") ? parseFloat(arg("--lon")!) : null;
  const supabase = createServiceRoleClient();

  const wd = await fetchWikidataContext(qid);
  const targetParkName = wd.parkLabel?.trim() || "Six Flags Qiddiya City";
  console.error(
    `Wikidata ${qid}: label="${wd.itemLabel ?? "?"}", park="${targetParkName}", country="${wd.countryLabel ?? "?"}"`,
  );

  let targetPark: DbPark | null = null;
  if (wd.parkQid) {
    const { data: byExternal, error: byExternalErr } = await supabase
      .from("parks")
      .select("id, name, country, latitude, longitude")
      .eq("external_source", "wikidata")
      .eq("external_id", wd.parkQid)
      .maybeSingle();
    if (byExternalErr) throw byExternalErr;
    targetPark = (byExternal as DbPark | null) ?? null;
  }
  if (!targetPark) {
    const { data: parkRows, error: parkErr } = await supabase
      .from("parks")
      .select("id, name, country, latitude, longitude")
      .ilike("name", targetParkName);
    if (parkErr) throw parkErr;
    targetPark = (parkRows?.[0] as DbPark | undefined) ?? null;
  }
  if (!targetPark) {
    const stopWords = new Set(["six", "flags", "city", "park", "theme"]);
    const token = targetParkName
      .split(/\s+/)
      .map((w) => w.trim())
      .find((w) => w.length >= 5 && !stopWords.has(w.toLowerCase()));
    if (token) {
      const { data: similar, error: similarErr } = await supabase
        .from("parks")
        .select("id, name, country, latitude, longitude")
        .ilike("name", `%${token}%`)
        .limit(5);
      if (similarErr) throw similarErr;
      const similarRows = (similar ?? []) as DbPark[];
      if (similarRows.length) {
        console.error(
          `Found similar park rows for token "${token}": ${similarRows.map((p) => `${p.id}:${p.name}`).join(", ")}`,
        );
        targetPark = similarRows[0];
      }
    }
  }

  if (!targetPark) {
    console.error(`Target park not found in DB; will ${apply ? "create" : "simulate create"} it.`);
    if (apply) {
      const lat = Number.isFinite(latOverride ?? NaN)
        ? latOverride
        : wd.lat;
      const lon = Number.isFinite(lonOverride ?? NaN)
        ? lonOverride
        : wd.lon;
      if (lat == null || lon == null) {
        throw new Error(
          "Target park coordinates missing. Re-run with --lat <num> --lon <num> to create park.",
        );
      }
      const { data: created, error: createErr } = await supabase
        .from("parks")
        .insert({
          name: targetParkName,
          country: wd.countryLabel ?? "Saudi Arabia",
          latitude: lat,
          longitude: lon,
          external_source: "wikidata",
          external_id: wd.parkQid,
          last_synced_at: new Date().toISOString(),
        })
        .select("id, name, country, latitude, longitude")
        .single();
      if (createErr) throw createErr;
      targetPark = created as DbPark;
    }
  }
  if (!targetPark) {
    console.error("No target park available in dry-run mode. Exiting.");
    return;
  }

  const search = `%falcon%flight%`;
  const { data: rows, error: rowErr } = await supabase
    .from("coasters")
    .select(
      "id, name, park_id, wikidata_id, external_source, external_id, parks(id, name, country, latitude, longitude)",
    )
    .or(`wikidata_id.eq.${qid},external_id.eq.${qid},name.ilike.${search},name.eq.${qid}`);
  if (rowErr) throw rowErr;

  const candidates = ((rows ?? []) as unknown as DbCoaster[]).filter((r) => {
    const n = r.name.toLowerCase();
    return (
      r.wikidata_id?.toUpperCase() === qid ||
      r.external_id?.toUpperCase() === qid ||
      n.includes("falcon") ||
      n === qid.toLowerCase()
    );
  });

  if (!candidates.length) {
    console.error("No candidate coaster rows found.");
    return;
  }

  console.error(`Found ${candidates.length} candidate rows:`);
  for (const c of candidates) {
    console.error(
      `  [${c.id}] ${c.name} @ ${c.parks?.name ?? `park#${c.park_id}`} (${c.parks?.country ?? "?"})`,
    );
  }

  const targetName = wd.itemLabel?.trim() || "Falcons Flight";
  const inferredNameFromRows =
    candidates.find((c) => /falcons?\s+flight/i.test(c.name))?.name ?? "Falcons Flight";
  const finalTargetName =
    /^Q\d+$/i.test(targetName) ? inferredNameFromRows : targetName;
  for (const c of candidates) {
    const patch: Record<string, unknown> = {
      park_id: targetPark.id,
      last_synced_at: new Date().toISOString(),
    };
    if (c.name.trim().toUpperCase() === qid) patch.name = finalTargetName;
    if (!c.wikidata_id) patch.wikidata_id = qid;
    if (!c.external_id) {
      patch.external_source = "wikidata";
      patch.external_id = qid;
    }
    console.error(`  ${apply ? "Applying" : "Would apply"} patch to [${c.id}]: ${JSON.stringify(patch)}`);
    if (apply) {
      const { error: upErr } = await supabase.from("coasters").update(patch).eq("id", c.id);
      if (upErr) {
        if ((upErr as { code?: string }).code === "23505" && "name" in patch) {
          const { name: _dropName, ...retryPatch } = patch;
          const { error: retryErr } = await supabase
            .from("coasters")
            .update(retryPatch)
            .eq("id", c.id);
          if (retryErr) throw retryErr;
        } else {
          throw upErr;
        }
      }
    }
  }

  if (apply) {
    const { data: postRows, error: postErr } = await supabase
      .from("coasters")
      .select("id, name, park_id, wikidata_id, external_source, external_id")
      .eq("park_id", targetPark.id)
      .or(`wikidata_id.eq.${qid},external_id.eq.${qid},name.ilike.${search},name.eq.${qid}`);
    if (postErr) throw postErr;
    const linked = (postRows ?? []) as DbCoaster[];
    if (linked.length > 1) {
      const sorted = [...linked].sort((a, b) => {
        const aq = a.name.trim().toUpperCase() === qid ? 1 : 0;
        const bq = b.name.trim().toUpperCase() === qid ? 1 : 0;
        if (aq !== bq) return aq - bq;
        const aw = (a.wikidata_id?.toUpperCase() === qid || a.external_id?.toUpperCase() === qid) ? 1 : 0;
        const bw = (b.wikidata_id?.toUpperCase() === qid || b.external_id?.toUpperCase() === qid) ? 1 : 0;
        if (aw !== bw) return bw - aw;
        return a.id - b.id;
      });
      const keep = sorted[0];
      const drop = sorted.slice(1).map((r) => r.id);
      console.error(`  Deduplicating linked rows, keeping ${keep.id}, dropping ${drop.join(", ")}`);
      await mergeDuplicateCoasterRows(supabase, keep.id, drop);
    }
  }

  console.error(apply ? "Repair complete." : "Dry-run complete.");
}

runMain(main);
