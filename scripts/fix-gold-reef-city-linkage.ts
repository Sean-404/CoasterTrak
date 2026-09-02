/**
 * One-off repair: Gold Reef City (South Africa) coasters mis-assigned to parks abroad.
 *
 *   npx tsx --env-file=.env.local scripts/fix-gold-reef-city-linkage.ts
 */
import { createClient } from "@supabase/supabase-js";

const GOLD_REEF_CITY = {
  name: "Gold Reef City",
  country: "South Africa",
  latitude: -26.2378,
  longitude: 28.0142,
  external_source: "wikidata",
  external_id: "Q1483280",
} as const;

const COASTER_QIDS = ["Q483513", "Q2446903"] as const;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, key);

  let parkId: number | null = null;

  const { data: existing } = await supabase
    .from("parks")
    .select("id,name,country")
    .eq("external_source", "wikidata")
    .eq("external_id", GOLD_REEF_CITY.external_id)
    .maybeSingle();

  if (existing) {
    parkId = existing.id;
    console.log(`Found existing Gold Reef City park id=${parkId}`);
    await supabase
      .from("parks")
      .update({
        name: GOLD_REEF_CITY.name,
        country: GOLD_REEF_CITY.country,
        latitude: GOLD_REEF_CITY.latitude,
        longitude: GOLD_REEF_CITY.longitude,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", parkId);
  } else {
    const { data: byName } = await supabase
      .from("parks")
      .select("id")
      .ilike("name", GOLD_REEF_CITY.name)
      .eq("country", GOLD_REEF_CITY.country)
      .maybeSingle();
    if (byName) {
      parkId = byName.id;
      await supabase
        .from("parks")
        .update({
          external_source: GOLD_REEF_CITY.external_source,
          external_id: GOLD_REEF_CITY.external_id,
          latitude: GOLD_REEF_CITY.latitude,
          longitude: GOLD_REEF_CITY.longitude,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", parkId);
      console.log(`Linked existing park id=${parkId} to Wikidata Q1483280`);
    } else {
      const { data: inserted, error } = await supabase
        .from("parks")
        .insert({ ...GOLD_REEF_CITY, last_synced_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error) throw error;
      parkId = inserted.id;
      console.log(`Created Gold Reef City park id=${parkId}`);
    }
  }

  for (const qid of COASTER_QIDS) {
    const { data: coaster, error: loadErr } = await supabase
      .from("coasters")
      .select("id,name,park_id,parks(name,country)")
      .eq("wikidata_id", qid)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!coaster) {
      console.log(`  ${qid}: not in database — skip`);
      continue;
    }
    const prev = Array.isArray(coaster.parks)
      ? (coaster.parks[0] as { name: string; country: string } | undefined)
      : (coaster.parks as { name: string; country: string } | null);
    if (coaster.park_id === parkId) {
      console.log(`  ${qid} ${coaster.name}: already at Gold Reef City`);
      continue;
    }
    const { error: updErr } = await supabase
      .from("coasters")
      .update({ park_id: parkId, last_synced_at: new Date().toISOString() })
      .eq("id", coaster.id);
    if (updErr) throw updErr;
    console.log(
      `  ${qid} ${coaster.name}: moved from ${prev?.name ?? "?"} (${prev?.country ?? "?"}) → Gold Reef City`,
    );
  }
}

void main();
