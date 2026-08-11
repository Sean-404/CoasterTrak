/**
 * CoasterTrak Data: match catalog parks/coasters against ThemeParks.wiki.
 *
 * Default: auto-match all catalog parks (name + cached DB links), DB-backed aliases.
 *
 * Usage:
 *   npm run data:match-themeparks
 *   npm run data:match-themeparks -- --write-db
 *   npm run data:match-themeparks -- --min-coasters 1 --delay-ms 300
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import {
  buildAliasLookup,
  buildThemeParksMatchReport,
  matchParkCoastersToThemeParks,
  type CatalogCoasterRow,
  type CatalogParkRow,
  type DbAliasRow,
  type ParkMatchResult,
  type ThemeParksMatchReport,
} from "../src/lib/data-platform/themeparks-match";
import {
  autoMatchAllCatalogParks,
  type ExistingParkLink,
  type ParkAutoMatchCandidate,
  type ParkAutoMatchResult,
} from "../src/lib/data-platform/park-auto-match";
import { aliasKeyFromName } from "../src/lib/data-platform/coaster-aliases";
import {
  fetchThemeParksDestinations,
  fetchThemeParksParkChildren,
  themeParksAttractions,
} from "../src/lib/themeparks-wiki";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatMarkdown(report: ThemeParksMatchReport): string {
  const lines: string[] = [];
  lines.push(`# ThemeParks.wiki match report`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`## Totals`);
  lines.push("");
  lines.push(`- Parks compared: **${report.parksCompared}** (auto: ${report.parksAutoMatched}, review: ${report.parksReview}, unmapped: ${report.parksUnmapped})`);
  lines.push(`- Local coasters: **${report.totals.localCoasters}**`);
  lines.push(`- Matched: **${report.totals.matched}**`);
  lines.push(`- Local-only (review): **${report.totals.localOnly}**`);
  lines.push(`- Name mismatch candidates: **${report.totals.nameMismatchCandidates}**`);
  lines.push(
    `- ThemeParks attractions scanned: **${report.totals.sourceAttractions}**`,
  );
  lines.push("");

  for (const park of report.parks) {
    lines.push(`## ${park.parkName}`);
    lines.push("");
    lines.push(
      `- ThemeParks: \`${park.themeParksParkName}\` (\`${park.themeParksParkId}\`) · park match ${park.parkMatchMethod} (${park.parkMatchConfidence})`,
    );
    lines.push(
      `- Coasters: ${park.matched.length} / ${park.matched.length + park.localOnly.length} matched · ${park.attractionCount} attractions in feed`,
    );
    lines.push("");

    if (park.localOnly.length) {
      lines.push(`### Local coasters missing in ThemeParks.wiki`);
      lines.push("");
      for (const row of park.localOnly) {
        lines.push(
          `- **[${row.severity}]** ${row.coasterName} (id=${row.coasterId}, status=${row.coasterStatus}${row.wikidataId ? `, ${row.wikidataId}` : ""})`,
        );
      }
      lines.push("");
    }

    const likelyMissing = park.sourceOnly.filter((s) => s.likelyCoaster);
    if (likelyMissing.length) {
      lines.push(`### ThemeParks attractions that look like coasters (not in catalog)`);
      lines.push("");
      for (const row of likelyMissing) {
        lines.push(`- ${row.themeParksName} (\`${row.themeParksId}\`)`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

async function persistReport(
  report: ThemeParksMatchReport,
  reportPath: string,
  parkReview: ParkAutoMatchCandidate[],
  unmappedParkIds: number[],
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: run, error: runErr } = await supabase
    .from("data_match_runs")
    .insert({
      source: "themeparks_wiki",
      status: "running",
      parks_compared: 0,
      report_path: reportPath,
    })
    .select("id")
    .single();

  if (runErr || !run) {
    throw new Error(`Failed to start data_match_runs: ${runErr?.message ?? "no row"}`);
  }

  const runId = run.id as number;

  try {
    await supabase
      .from("data_review_findings")
      .update({ status: "resolved", resolved_at: report.generatedAt })
      .eq("status", "open")
      .in("finding_type", [
        "local_coaster_missing_in_source",
        "source_attraction_unmatched",
        "park_unmapped",
        "name_mismatch_candidate",
        "park_match_candidate",
      ]);

    for (const park of report.parks) {
      await supabase
        .from("data_park_source_links")
        .delete()
        .eq("source", "themeparks_wiki")
        .or(`external_id.eq.${park.themeParksParkId},park_id.eq.${park.parkId}`);

      const { error: parkLinkErr } = await supabase.from("data_park_source_links").insert({
        park_id: park.parkId,
        source: "themeparks_wiki",
        external_id: park.themeParksParkId,
        external_name: park.themeParksParkName,
        match_method: park.parkMatchMethod === "cached" ? "auto" : park.parkMatchMethod,
        confidence: park.parkMatchConfidence,
        last_verified_at: report.generatedAt,
      });
      if (parkLinkErr) throw new Error(`park link insert failed: ${parkLinkErr.message}`);

      for (const m of park.matched) {
        await supabase
          .from("data_coaster_source_links")
          .delete()
          .eq("source", "themeparks_wiki")
          .or(`external_id.eq.${m.themeParksId},coaster_id.eq.${m.coasterId}`);

        const { error } = await supabase.from("data_coaster_source_links").insert({
          coaster_id: m.coasterId,
          source: "themeparks_wiki",
          external_id: m.themeParksId,
          external_name: m.themeParksName,
          match_method: m.matchMethod,
          confidence: m.confidence,
          last_verified_at: report.generatedAt,
        });
        if (error) throw new Error(`coaster link insert failed: ${error.message}`);
      }

      const findings = [
        ...park.localOnly.map((row) => ({
          run_id: runId,
          park_id: park.parkId,
          coaster_id: row.coasterId,
          finding_type: "local_coaster_missing_in_source" as const,
          severity: row.severity,
          title: `${park.parkName}: ${row.coasterName} not in ThemeParks.wiki`,
          detail: row,
          status: "open" as const,
        })),
        ...park.sourceOnly
          .filter((s) => s.likelyCoaster)
          .map((row) => ({
            run_id: runId,
            park_id: park.parkId,
            coaster_id: null as number | null,
            finding_type: "source_attraction_unmatched" as const,
            severity: "warn" as const,
            title: `${park.parkName}: missing coaster — ${row.themeParksName}`,
            detail: row,
            status: "open" as const,
          })),
        ...park.nameMismatchCandidates.map((row) => ({
          run_id: runId,
          park_id: park.parkId,
          coaster_id: row.coasterId,
          finding_type: "name_mismatch_candidate" as const,
          severity: "warn" as const,
          title: `${park.parkName}: rename? ${row.coasterName} ↔ ${row.themeParksName}`,
          detail: row,
          status: "open" as const,
        })),
      ];

      if (findings.length) {
        const { error } = await supabase.from("data_review_findings").insert(findings);
        if (error) throw new Error(`findings insert failed: ${error.message}`);
      }
    }

    for (const candidate of parkReview) {
      const { error } = await supabase.from("data_review_findings").insert({
        run_id: runId,
        park_id: candidate.catalogPark.id,
        finding_type: "park_match_candidate",
        severity: "warn",
        title: `Park link? ${candidate.catalogPark.name} ↔ ${candidate.themeParksParkName}`,
        detail: candidate,
        status: "open",
      });
      if (error) throw new Error(`park review insert failed: ${error.message}`);
    }

    for (const parkId of unmappedParkIds) {
      const { error } = await supabase.from("data_review_findings").insert({
        run_id: runId,
        park_id: parkId,
        finding_type: "park_unmapped",
        severity: "info",
        title: `No ThemeParks.wiki park match`,
        detail: { parkId },
        status: "open",
      });
      if (error) throw new Error(`unmapped park insert failed: ${error.message}`);
    }

    const { error: finishErr } = await supabase
      .from("data_match_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        parks_compared: report.parksCompared,
        coasters_matched: report.totals.matched,
        coasters_unmatched: report.totals.localOnly,
      })
      .eq("id", runId);
    if (finishErr) throw new Error(`finish run failed: ${finishErr.message}`);
  } catch (e) {
    await supabase
      .from("data_match_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
      })
      .eq("id", runId);
    throw e;
  }
}

async function main() {
  const outPath = resolve(arg("--out") ?? "data/themeparks-match-report.json");
  const mdPath = outPath.replace(/\.json$/i, ".md");
  const writeDb = hasFlag("--write-db");
  const delayMs = Number(arg("--delay-ms") ?? "250");
  const minCoasters = Number(arg("--min-coasters") ?? "1");

  const supabase = createServiceRoleClient();

  const [{ data: parks, error: parksErr }, { data: aliasRows, error: aliasErr }, { data: parkLinks, error: linksErr }] =
    await Promise.all([
      fetchAllPages<CatalogParkRow>(SUPABASE_PAGE_SIZE, (from, to) =>
        supabase
          .from("parks")
          .select("id, name, country, latitude, longitude")
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<DbAliasRow>(SUPABASE_PAGE_SIZE, (from, to) =>
        supabase
          .from("data_coaster_name_aliases")
          .select("key_a, key_b, park_id, approved")
          .eq("approved", true)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<ExistingParkLink>(SUPABASE_PAGE_SIZE, (from, to) =>
        supabase
          .from("data_park_source_links")
          .select("park_id, external_id, external_name, match_method")
          .eq("source", "themeparks_wiki")
          .order("park_id", { ascending: true })
          .range(from, to),
      ),
    ]);

  if (parksErr) throw new Error(`Failed to load parks: ${parksErr.message}`);
  if (aliasErr) throw new Error(`Failed to load aliases: ${aliasErr.message}`);
  if (linksErr) throw new Error(`Failed to load park links: ${linksErr.message}`);

  const aliasLookup = buildAliasLookup(aliasRows);
  console.log(`Loaded ${aliasRows.length} alias pairs from database.`);

  console.log("Fetching ThemeParks.wiki destinations…");
  const destinations = await fetchThemeParksDestinations();

  const { matched: parkMatches, review: parkReview, unmapped } = autoMatchAllCatalogParks({
    catalogParks: parks,
    destinations,
    existingLinks: parkLinks,
  });

  console.log(
    `Park auto-match: ${parkMatches.length} linked, ${parkReview.length} for review, ${unmapped.length} unmapped.`,
  );

  const coastersByPark = new Map<number, CatalogCoasterRow[]>();
  const { data: allCoasters, error: coastersErr } = await fetchAllPages<CatalogCoasterRow>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select("id, park_id, name, status, coaster_type, wikidata_id")
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (coastersErr) throw new Error(`Failed to load coasters: ${coastersErr.message}`);

  for (const c of allCoasters) {
    const arr = coastersByPark.get(c.park_id) ?? [];
    arr.push(c);
    coastersByPark.set(c.park_id, arr);
  }

  const parkResults: ParkMatchResult[] = [];

  for (const pm of parkMatches) {
    const coasters = coastersByPark.get(pm.catalogPark.id) ?? [];
    if (coasters.length < minCoasters) continue;

    console.log(`→ ${pm.catalogPark.name}: fetching ThemeParks children (${pm.themeParksParkId})…`);
    const children = await fetchThemeParksParkChildren(pm.themeParksParkId);
    const attractions = themeParksAttractions(children.children ?? []);

    parkResults.push(
      matchParkCoastersToThemeParks({
        park: pm.catalogPark,
        coasters,
        themeParksParkId: pm.themeParksParkId,
        themeParksParkName: children.name || pm.themeParksParkName,
        parkMatchMethod: pm.method,
        parkMatchConfidence: pm.confidence,
        attractions,
        aliasLookup,
      }),
    );

    if (delayMs > 0) await sleep(delayMs);
  }

  const report = buildThemeParksMatchReport(parkResults, {
    auto: parkMatches.length,
    review: parkReview.length,
    unmapped: unmapped.length,
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log("");
  console.log(`Parks compared: ${report.parksCompared}`);
  console.log(`Matched: ${report.totals.matched} / ${report.totals.localCoasters}`);
  console.log(`Local-only: ${report.totals.localOnly}`);
  console.log(`Name mismatches (learn aliases in /admin/data): ${report.totals.nameMismatchCandidates}`);
  console.log(`Wrote ${outPath}`);

  if (writeDb) {
    console.log("Persisting links + findings to Supabase…");
    await persistReport(
      report,
      outPath,
      parkReview,
      unmapped.map((p) => p.id),
    );
    console.log("DB write complete.");
  }
}

runMain(main);
