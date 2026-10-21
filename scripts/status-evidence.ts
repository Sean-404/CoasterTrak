/**
 * Collect evidence for catalog rides whose status is not confirmed, and (only with approval)
 * record the strong ThemeParks.wiki ones as `status = Operating` field overrides.
 *
 * Report (read-only against Supabase; rate-limited + cached against the APIs):
 *   npm run data:status-evidence
 *   npm run data:status-evidence -- --skip-osm --max-age-hours 72
 *   npm run data:status-evidence -- --offline            # rebuild from cache only
 *
 * Apply approved proposals from a report you have reviewed (dry run unless --apply):
 *   npm run data:status-evidence -- --approve approved.txt
 *   npm run data:status-evidence -- --approve approved.txt --apply
 *
 * approved.txt lists coaster ids (one per line, `#` comments). Only `propose_operating` rows
 * can be written; everything else is review-only and needs a cited source fixed by hand.
 * OSM data (ODbL) is used as a cross-check in the report and never written anywhere.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { arg, hasFlag, runMain } from "./lib/cli";
import { createPoliteFetcher } from "./lib/polite-fetch";
import { createServiceRoleClient } from "./lib/supabase-service";
import { normalizeCatalog } from "../src/lib/catalog-normalize";
import { coasterLifecycle } from "../src/lib/coaster-status";
import { dedupeCoastersForCatalog } from "../src/lib/coaster-dedup";
import { buildAliasLookup, type DbAliasRow } from "../src/lib/data-platform/coaster-aliases";
import { autoMatchAllCatalogParks, type ExistingParkLink } from "../src/lib/data-platform/park-auto-match";
import {
  assessOsmPark,
  assessThemeParksPark,
  buildOverpassBatchQuery,
  chooseOsmParkGroup,
  decideStatusVerdict,
  downgradeLeakedEntities,
  hasEvidence,
  parseApprovalList,
  parseOverpassParkGroups,
  selectOverrideWrites,
  type EvidenceCoaster,
  type EvidencePark,
  type ExistingStatusOverride,
  type Lifecycle,
  type OsmElement,
  type OsmFeature,
  type OsmParkAssessment,
  type OsmRowEvidence,
  type StatusProposal,
  type StatusVerdict,
  type ThemeParksLive,
  type ThemeParksParkAssessment,
  type ThemeParksRowEvidence,
} from "../src/lib/data-platform/status-evidence";
import { isCatalogHiddenParkName } from "../src/lib/park-match";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import {
  THEMEPARKS_WIKI_BASE,
  themeParksAttractions,
  type ThemeParksChildrenResponse,
  type ThemeParksDestination,
} from "../src/lib/themeparks-wiki";
import type { Coaster, Park } from "../src/types/domain";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OSM_ATTRIBUTION =
  "OSM cross-check data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Internal review only — not for the public catalog.";
const MAX_REPORT_AGE_DAYS = 14;

const PARK_COLUMNS = "id,name,country,latitude,longitude";
const COASTER_COLUMNS =
  "id,park_id,name,coaster_type,manufacturer,status,wikidata_id,image_url,length_ft,speed_mph,height_ft,inversions,duration_s,opening_year,closing_year";

type ReportRow = StatusProposal & {
  parkId: number;
  wikidataId: string | null;
  status: string;
  openingYear: number | null;
  closingYear: number | null;
  reasons: string[];
  osm: OsmRowEvidence | null;
  osmPolygon: OsmParkAssessment["polygon"] | null;
  /** Overrides reach the site at the next Wikidata publish, keyed by wikidata_id. */
  overrideReachesSite: boolean;
};

type StatusEvidenceReport = {
  generatedAt: string;
  sources: {
    themeParks: { api: string; parksLinked: number; parksFetched: number; note: string };
    osm: {
      api: string;
      parksQueried: number;
      parksWithPolygon: number;
      /** Only a nearby polygon with a different name — not used as evidence. */
      parksUnsure: string[];
      errors: string[];
      attribution: string;
    } | null;
  };
  totals: {
    unconfirmed: number;
    withEvidence: number;
    byVerdict: Record<StatusVerdict, number>;
    appliable: number;
    appliableWithoutWikidataId: number;
  };
  rows: ReportRow[];
  themeParksParks: Array<Omit<ThemeParksParkAssessment, "attractionIds" | "rows">>;
  osmParks: Array<Omit<OsmParkAssessment, "rows">>;
};

async function loadCatalog() {
  const supabase = createServiceRoleClient();
  const [parks, coasters, aliases, links] = await Promise.all([
    fetchAllPages<Park>(SUPABASE_PAGE_SIZE, (from, to) =>
      supabase.from("parks").select(PARK_COLUMNS).order("id").range(from, to),
    ),
    fetchAllPages<Coaster>(SUPABASE_PAGE_SIZE, (from, to) =>
      supabase.from("coasters").select(COASTER_COLUMNS).order("id").range(from, to),
    ),
    fetchAllPages<DbAliasRow>(SUPABASE_PAGE_SIZE, (from, to) =>
      supabase
        .from("data_coaster_name_aliases")
        .select("key_a, key_b, park_id, approved")
        .eq("approved", true)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages<ExistingParkLink>(SUPABASE_PAGE_SIZE, (from, to) =>
      supabase
        .from("data_park_source_links")
        .select("park_id, external_id, external_name, match_method")
        .eq("source", "themeparks_wiki")
        .order("park_id")
        .range(from, to),
    ),
  ]);
  for (const [label, r] of Object.entries({ parks, coasters, aliases, links })) {
    if (r.error) throw new Error(`Failed to load ${label}: ${r.error.message}`);
  }

  // Same shaping as the public catalog, so "unconfirmed" means what the site shows.
  const normalized = normalizeCatalog(parks.data, coasters.data);
  const publicParks = normalized.parks.filter((p) => !isCatalogHiddenParkName(p.name));
  const parkById = new Map(publicParks.map((p) => [p.id, p]));
  const publicCoasters: EvidenceCoaster[] = dedupeCoastersForCatalog(normalized.coasters)
    .filter((c) => parkById.has(c.park_id))
    .map((c) => ({
      id: c.id,
      park_id: c.park_id,
      name: c.name,
      status: c.status,
      lifecycle: coasterLifecycle(c),
      wikidata_id: c.wikidata_id ?? null,
      opening_year: c.opening_year ?? null,
      closing_year: c.closing_year ?? null,
    }));

  const remappedLinks = links.data.map((l) => ({ ...l, park_id: normalized.idRemap.get(l.park_id) ?? l.park_id }));
  return {
    supabase,
    parks: publicParks,
    parkById,
    coasters: publicCoasters,
    aliasLookup: buildAliasLookup(aliases.data),
    links: remappedLinks,
  };
}

function evidencePark(p: Park): EvidencePark {
  return { id: p.id, name: p.name, country: p.country ?? null, latitude: p.latitude ?? null, longitude: p.longitude ?? null };
}

async function buildReport(): Promise<StatusEvidenceReport> {
  const cacheRoot = resolve(arg("--cache-dir") ?? "data/cache");
  const maxAgeMs = Number(arg("--max-age-hours") ?? "24") * 3600_000;
  const offline = hasFlag("--offline");
  const skipOsm = hasFlag("--skip-osm");
  const osmBatch = Number(arg("--osm-batch") ?? "10");
  const log = (m: string) => console.log(m);

  const themeParks = createPoliteFetcher({
    cacheDir: `${cacheRoot}/themeparks-wiki`,
    minIntervalMs: Number(arg("--themeparks-delay-ms") ?? "1000"),
    maxAgeMs,
    offline,
    log,
  });
  const overpass = createPoliteFetcher({
    cacheDir: `${cacheRoot}/overpass`,
    minIntervalMs: Number(arg("--overpass-delay-ms") ?? "10000"),
    maxAgeMs: Math.max(maxAgeMs, 7 * 24 * 3600_000),
    offline,
    maxAttempts: 5,
    log,
  });

  const catalog = await loadCatalog();
  const unconfirmed = catalog.coasters.filter((c) => c.lifecycle === "Unknown");
  const coastersByPark = new Map<number, EvidenceCoaster[]>();
  for (const c of catalog.coasters) coastersByPark.set(c.park_id, [...(coastersByPark.get(c.park_id) ?? []), c]);
  const parkIdsWithUnknown = [...new Set(unconfirmed.map((c) => c.park_id))].sort((a, b) => a - b);
  console.log(
    `Catalog: ${catalog.coasters.length} public rides, ${unconfirmed.length} unconfirmed at ${parkIdsWithUnknown.length} parks.`,
  );

  // --- ThemeParks.wiki -----------------------------------------------------
  const destinations = await themeParks.getJson<{ destinations: ThemeParksDestination[] }>(
    `${THEMEPARKS_WIKI_BASE}/destinations`,
  );
  const { matched: parkLinks } = autoMatchAllCatalogParks({
    catalogParks: catalog.parks,
    destinations: destinations.data.destinations ?? [],
    existingLinks: catalog.links,
  });
  const linkByPark = new Map(parkLinks.map((l) => [l.catalogPark.id, l]));
  const tpTargets = parkIdsWithUnknown.filter((id) => linkByPark.has(id));
  console.log(`ThemeParks.wiki: ${parkLinks.length} parks linked; fetching ${tpTargets.length} with unconfirmed rides.`);

  let tpAssessments: ThemeParksParkAssessment[] = [];
  for (const parkId of tpTargets) {
    const link = linkByPark.get(parkId)!;
    const park = catalog.parkById.get(parkId)!;
    const base = `${THEMEPARKS_WIKI_BASE}/entity/${encodeURIComponent(link.themeParksParkId)}`;
    try {
      const children = await themeParks.getJson<ThemeParksChildrenResponse>(`${base}/children`);
      const live = await themeParks.getJson<{ liveData?: Array<{ id: string; status?: string; lastUpdated?: string }> }>(
        `${base}/live`,
      );
      const liveById = new Map<string, ThemeParksLive>(
        (live.data.liveData ?? []).map((l) => [l.id, { status: l.status ?? null, lastUpdated: l.lastUpdated ?? null }]),
      );
      tpAssessments.push(
        assessThemeParksPark({
          park: evidencePark(park),
          coasters: coastersByPark.get(parkId) ?? [],
          themeParksParkId: link.themeParksParkId,
          themeParksParkName: children.data.name || link.themeParksParkName,
          parkMatchMethod: link.method,
          parkMatchConfidence: link.confidence,
          attractions: themeParksAttractions(children.data.children ?? []),
          live: liveById,
          fetchedAt: children.fetchedAt,
          aliasLookup: catalog.aliasLookup,
        }),
      );
      console.log(`  ✓ ${park.name}${children.fromCache ? " (cache)" : ""}`);
    } catch (e) {
      console.warn(`  ✗ ${park.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  tpAssessments = downgradeLeakedEntities(tpAssessments);
  const tpByCoaster = new Map<number, ThemeParksRowEvidence>();
  for (const a of tpAssessments) for (const r of a.rows) tpByCoaster.set(r.coasterId, r);

  // --- OpenStreetMap (cross-check only) -----------------------------------
  const osmAssessments: OsmParkAssessment[] = [];
  const osmErrors: string[] = [];
  const osmUnsure: string[] = [];
  const osmTargets = parkIdsWithUnknown
    .map((id) => catalog.parkById.get(id)!)
    .filter((p) => p.latitude != null && p.longitude != null);
  if (!skipOsm) {
    console.log(`Overpass: ${osmTargets.length} parks in batches of ${osmBatch}.`);
    for (let i = 0; i < osmTargets.length; i += osmBatch) {
      const batch = osmTargets.slice(i, i + osmBatch);
      const query = buildOverpassBatchQuery(batch.map((p) => ({ latitude: p.latitude, longitude: p.longitude })));
      try {
        const res = await overpass.getJson<{ elements: OsmElement[] }>(OVERPASS_URL, {
          body: `data=${encodeURIComponent(query)}`,
        });
        const groups = parseOverpassParkGroups(res.data.elements ?? []);
        for (const park of batch) {
          const choice = chooseOsmParkGroup(groups, evidencePark(park));
          if (!choice) continue;
          if (!choice.confident) {
            osmUnsure.push(`${park.name} (nearest polygon: ${choice.group.park.tags?.name ?? "unnamed"})`);
            continue;
          }
          osmAssessments.push(
            assessOsmPark({
              park: evidencePark(park),
              coasters: coastersByPark.get(park.id) ?? [],
              choice,
              aliasLookup: catalog.aliasLookup,
            }),
          );
        }
        console.log(`  ✓ batch ${i / osmBatch + 1}: ${groups.length} park polygons${res.fromCache ? " (cache)" : ""}`);
      } catch (e) {
        const msg = `batch ${i / osmBatch + 1} (${batch.map((p) => p.name).join(", ")}): ${e instanceof Error ? e.message : String(e)}`;
        osmErrors.push(msg);
        console.warn(`  ✗ ${msg}`);
      }
    }
  }
  const osmByCoaster = new Map<number, { row: OsmRowEvidence; polygon: OsmParkAssessment["polygon"] }>();
  for (const a of osmAssessments) for (const r of a.rows) osmByCoaster.set(r.coasterId, { row: r, polygon: a.polygon });

  // --- Verdicts -----------------------------------------------------------
  const currentYear = new Date().getFullYear();
  const rows: ReportRow[] = unconfirmed.map((c) => {
    const tp = tpByCoaster.get(c.id) ?? null;
    const osm = osmByCoaster.get(c.id) ?? null;
    const decision = decideStatusVerdict({ coaster: c, themeParks: tp, osm: osm?.row, currentYear });
    return {
      coasterId: c.id,
      coasterName: c.name,
      parkId: c.park_id,
      parkName: catalog.parkById.get(c.park_id)?.name ?? `park ${c.park_id}`,
      wikidataId: c.wikidata_id,
      status: c.status,
      openingYear: c.opening_year,
      closingYear: c.closing_year,
      verdict: decision.verdict,
      appliable: decision.appliable,
      reasons: decision.reasons,
      themeParks: tp,
      osm: osm?.row ?? null,
      osmPolygon: osm?.polygon ?? null,
      overrideReachesSite: Boolean(c.wikidata_id),
    };
  });
  rows.sort((a, b) => a.parkName.localeCompare(b.parkName) || a.coasterName.localeCompare(b.coasterName));

  const byVerdict: Record<StatusVerdict, number> = {
    propose_operating: 0,
    review_operating: 0,
    review_defunct: 0,
    conflict: 0,
    no_evidence: 0,
  };
  for (const r of rows) byVerdict[r.verdict]++;

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      themeParks: {
        api: THEMEPARKS_WIKI_BASE,
        parksLinked: parkLinks.length,
        parksFetched: tpAssessments.length,
        note: "An entity in a park's feed means the ride is in the current lineup, not that it opens today.",
      },
      osm: skipOsm
        ? null
        : {
            api: OVERPASS_URL,
            parksQueried: osmTargets.length,
            parksWithPolygon: osmAssessments.length,
            parksUnsure: osmUnsure,
            errors: osmErrors,
            attribution: OSM_ATTRIBUTION,
          },
    },
    totals: {
      unconfirmed: rows.length,
      withEvidence: rows.filter((r) => hasEvidence(r.verdict)).length,
      byVerdict,
      appliable: rows.filter((r) => r.appliable).length,
      appliableWithoutWikidataId: rows.filter((r) => r.appliable && !r.wikidataId).length,
    },
    rows,
    // Per-row evidence already lives in `rows`; keep the park sections to coverage + missing rides.
    themeParksParks: tpAssessments.map((p) => {
      const { attractionIds, rows: parkRows, ...rest } = p;
      void attractionIds;
      void parkRows;
      return rest;
    }),
    osmParks: osmAssessments.map((p) => {
      const { rows: parkRows, ...rest } = p;
      void parkRows;
      return rest;
    }),
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const VERDICT_TITLES: Record<StatusVerdict, string> = {
  propose_operating: "Proposed: Operating (ThemeParks.wiki, strong match) — appliable after approval",
  review_operating: "Review: probably operating (weak match or OSM only) — not appliable",
  review_defunct: "Review: possibly defunct — never auto-applied",
  conflict: "Conflict: sources disagree",
  no_evidence: "No evidence from either source",
};

function rowLine(r: ReportRow): string {
  const ids = [`id ${r.coasterId}`, r.wikidataId ?? "no wikidata_id"].join(", ");
  const links: string[] = [];
  if (r.themeParks?.kind === "present") {
    const live = r.themeParks.live ? `, live ${r.themeParks.live.status} @ ${r.themeParks.live.lastUpdated}` : "";
    links.push(`[ThemeParks.wiki](${r.themeParks.entityUrl}) fetched ${r.themeParks.fetchedAt}${live}`);
  }
  if (r.osm && r.osm.kind !== "not_mapped") {
    links.push(`[OSM ${r.osm.feature.osmIds[0]}](https://www.openstreetmap.org/${r.osm.feature.osmIds[0]})`);
  }
  const box = r.verdict === "propose_operating" ? "- [ ] " : "- ";
  return `${box}**${r.coasterName}** — ${r.parkName} (${ids})${links.length ? ` · ${links.join(" · ")}` : ""}\n  - ${r.reasons.join("; ") || "no source covers this park"}`;
}

function formatMarkdown(report: StatusEvidenceReport): string {
  const t = report.totals;
  const lines = [
    "# Unconfirmed ride status — evidence report (dry run)",
    "",
    `Generated ${report.generatedAt}. Nothing has been written to the database.`,
    "",
    `**${t.withEvidence} of ${t.unconfirmed} unconfirmed rides have evidence either way.**`,
    "",
    "| Verdict | Rides |",
    "| --- | ---: |",
    ...(Object.keys(VERDICT_TITLES) as StatusVerdict[]).map((v) => `| ${v} | ${t.byVerdict[v]} |`),
    "",
    `ThemeParks.wiki: ${report.sources.themeParks.parksFetched} linked parks fetched. ${report.sources.themeParks.note}`,
    report.sources.osm
      ? `OSM: ${report.sources.osm.parksWithPolygon}/${report.sources.osm.parksQueried} parks matched to a park polygon by name (not used: ${report.sources.osm.parksUnsure.join(", ") || "none"})${report.sources.osm.errors.length ? `; ${report.sources.osm.errors.length} batch errors` : ""}.`
      : "OSM: skipped.",
    "",
    "## How to apply",
    "",
    "1. Check each `propose_operating` row below (open the ThemeParks.wiki link; spot-check the park's own site).",
    "2. Put the approved coaster ids in a text file, one per line.",
    "3. `npm run data:status-evidence -- --approve approved.txt` (dry run), then add `--apply`.",
    "",
    "Writes go to `data_coaster_field_overrides` as `status = Operating`, `source = themeparks_wiki`, `source_url` = the entity URL.",
    `They reach the site at the next Wikidata publish, which matches overrides by wikidata_id — ${t.appliableWithoutWikidataId} of the ${t.appliable} proposals have no wikidata_id and will not show until that is fixed.`,
    "",
  ];
  for (const v of Object.keys(VERDICT_TITLES) as StatusVerdict[]) {
    const rs = report.rows.filter((r) => r.verdict === v);
    if (!rs.length) continue;
    lines.push(`## ${VERDICT_TITLES[v]} (${rs.length})`, "", ...rs.map(rowLine), "");
  }

  const tpMissing = report.themeParksParks.filter((p) => p.possibleMissing.length);
  const osmMissing = report.osmParks.filter((p) => p.possibleMissing.length);
  if (tpMissing.length || osmMissing.length) {
    lines.push("## Possibly missing from the catalog (review only)", "");
    for (const p of tpMissing) {
      lines.push(`- ${p.parkName} — ThemeParks.wiki: ${p.possibleMissing.map((m) => m.name).join(", ")}`);
    }
    for (const p of osmMissing) {
      lines.push(`- ${p.parkName} — OSM: ${p.possibleMissing.map((m: OsmFeature) => m.name).join(", ")}`);
    }
    lines.push("");
  }

  lines.push(
    "## Licensing note (OSM)",
    "",
    "OSM data is ODbL. Using it here as a private cross-check, with attribution, is fine. Copying OSM",
    "names, coordinates or existence facts into the public catalog would make that part of the catalog a",
    "derived database that must be offered under ODbL (share-alike) with attribution. So OSM findings",
    "stay in this report; any catalog fix needs a non-OSM source.",
    "",
    report.sources.osm?.attribution ?? "",
    "",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function applyApproved(reportPath: string, approvePath: string, apply: boolean) {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as StatusEvidenceReport;
  const ageDays = (Date.now() - Date.parse(report.generatedAt)) / 86_400_000;
  if (ageDays > MAX_REPORT_AGE_DAYS) {
    throw new Error(`Report is ${ageDays.toFixed(0)} days old; regenerate it before applying.`);
  }
  const approvedIds = parseApprovalList(await readFile(approvePath, "utf8"));

  const catalog = await loadCatalog();
  const currentLifecycle = new Map<number, Lifecycle>(catalog.coasters.map((c) => [c.id, c.lifecycle]));
  const { data: existing, error } = await fetchAllPages<ExistingStatusOverride>(SUPABASE_PAGE_SIZE, (from, to) =>
    catalog.supabase
      .from("data_coaster_field_overrides")
      .select("coaster_id, value_text, source")
      .eq("field_name", "status")
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(`Failed to load existing overrides: ${error.message}`);

  const { writes, skipped } = selectOverrideWrites({
    proposals: report.rows,
    approvedIds,
    existingOverrides: existing,
    currentLifecycle,
  });
  for (const s of skipped) console.log(`  skip ${s.coasterId}: ${s.reason}`);
  for (const w of writes) console.log(`  ${apply ? "write" : "would write"} ${w.coaster_id} → Operating (${w.source_url})`);

  if (!apply) {
    console.log(`Dry run: ${writes.length} override(s) would be written. Re-run with --apply to write them.`);
    return;
  }
  if (!writes.length) return;
  // Plain insert: an override created since the check above fails loudly instead of being replaced.
  const { error: insertErr } = await catalog.supabase.from("data_coaster_field_overrides").insert(writes);
  if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);
  console.log(`Wrote ${writes.length} status override(s).`);
}

async function main() {
  const outPath = resolve(arg("--out") ?? "data/status-evidence/report.json");
  const approvePath = arg("--approve");

  if (approvePath) {
    await applyApproved(outPath, resolve(approvePath), hasFlag("--apply"));
    return;
  }
  if (hasFlag("--apply")) throw new Error("--apply needs --approve <file> listing reviewed coaster ids.");

  const report = await buildReport();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outPath.replace(/\.json$/i, ".md"), formatMarkdown(report), "utf8");

  const t = report.totals;
  console.log("");
  console.log(`${t.withEvidence}/${t.unconfirmed} unconfirmed rides have evidence either way.`);
  console.log(JSON.stringify(t.byVerdict));
  console.log(`Wrote ${outPath} (+ .md). Nothing written to the database.`);
}

runMain(main);
