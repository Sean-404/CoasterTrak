/**
 * Find Wikipedia `/extend` clone/relocation articles and insert missing park
 * installs as sibling catalog rows (no shared Wikidata id).
 *
 *   npx tsx --env-file=.env.local scripts/ensure-wikipedia-extra-installs.ts
 *   npx tsx --env-file=.env.local scripts/ensure-wikipedia-extra-installs.ts --dry-run
 */
import { arg, hasFlag, runMain } from "./lib/cli";
import { loadLocalEnvIfPresent } from "./lib/load-local-env";
import { createServiceRoleClient } from "./lib/supabase-service";
import {
  extraInstallInsertRow,
  planDiscoveredInfoboxInstalls,
} from "../src/lib/catalog-extra-installs";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import {
  fetchEnwikiWikitext,
  listRollerCoasterExtendArticleTitles,
  parseInfoboxCoasterLocationsFromWikitext,
  parseInfoboxCoasterStatsFromWikitext,
} from "../src/lib/wikipedia-infobox-coaster";
import type { Coaster, Park } from "../src/types/domain";

loadLocalEnvIfPresent();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const delayMs = arg("--delay-ms") ? parseInt(arg("--delay-ms")!, 10) : 200;
  const limit = arg("--limit") ? parseInt(arg("--limit")!, 10) : Infinity;

  const supabase = createServiceRoleClient();
  const [{ data: parks, error: parkError }, { data: coasters, error: coasterError }] =
    await Promise.all([
      fetchAllPages<Park>(SUPABASE_PAGE_SIZE, (from, to) =>
        supabase
          .from("parks")
          .select("id,name,country,latitude,longitude")
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<Coaster>(SUPABASE_PAGE_SIZE, (from, to) =>
        supabase
          .from("coasters")
          .select(
            "id,park_id,name,status,coaster_type,manufacturer,opening_year,closing_year,height_ft,speed_mph,length_ft,inversions,duration_s,rcdb_id,enwiki_title",
          )
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);
  if (parkError) throw new Error(parkError.message);
  if (coasterError) throw new Error(coasterError.message);

  const parkRows = parks ?? [];
  const coasterRows = [...(coasters ?? [])];

  console.error("Listing Wikipedia infobox /extend articles…");
  const titles = await listRollerCoasterExtendArticleTitles();
  console.error(`  ${titles.length} articles transclude an extend infobox`);

  let scanned = 0;
  let inserted = 0;
  let patched = 0;
  let skipped = 0;

  for (const title of titles) {
    if (scanned >= limit) break;
    scanned += 1;
    const wikitext = await fetchEnwikiWikitext(title);
    if (delayMs > 0) await sleep(delayMs);
    if (!wikitext) {
      skipped += 1;
      continue;
    }

    const locations = parseInfoboxCoasterLocationsFromWikitext(wikitext);
    if (locations.length < 2) {
      skipped += 1;
      continue;
    }

    const stats = parseInfoboxCoasterStatsFromWikitext(wikitext);
    const plans = planDiscoveredInfoboxInstalls({
      parks: parkRows,
      coasters: coasterRows,
      articleTitle: title,
      locations,
      stats,
    });
    if (plans.length === 0) continue;

    for (const plan of plans) {
      if (plan.action === "insert") {
        inserted += 1;
        console.error(
          `  insert ${plan.spec.name} at ${plan.spec.parkName} (from ${title})`,
        );
        if (dryRun) continue;
        const { data, error } = await supabase
          .from("coasters")
          .insert(extraInstallInsertRow(plan.parkId, plan.spec, new Date().toISOString()))
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) {
          coasterRows.push({
            id: data.id,
            park_id: plan.parkId,
            name: plan.spec.name,
            status: plan.spec.status,
            coaster_type: plan.spec.coaster_type,
            manufacturer: plan.spec.manufacturer ?? null,
            opening_year: plan.spec.opening_year ?? null,
            closing_year: plan.spec.closing_year ?? null,
            height_ft: plan.spec.height_ft ?? null,
            speed_mph: plan.spec.speed_mph ?? null,
            length_ft: plan.spec.length_ft ?? null,
            inversions: plan.spec.inversions ?? null,
            duration_s: plan.spec.duration_s ?? null,
            rcdb_id: plan.spec.rcdb_id ?? null,
            enwiki_title: plan.spec.enwiki_title ?? title,
          });
        }
        continue;
      }

      patched += 1;
      console.error(
        `  patch ${plan.spec.name} #${plan.coasterId}: ${Object.keys(plan.patch).join(", ")}`,
      );
      if (dryRun) continue;
      const { error } = await supabase.from("coasters").update(plan.patch).eq("id", plan.coasterId);
      if (error) throw error;
      const idx = coasterRows.findIndex((c) => c.id === plan.coasterId);
      if (idx >= 0) coasterRows[idx] = { ...coasterRows[idx]!, ...plan.patch };
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        articles: scanned,
        inserted,
        patched,
        skipped,
      },
      null,
      2,
    ),
  );
}

runMain(main);
