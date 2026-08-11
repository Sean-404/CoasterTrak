/**
 * One-time audit: flag coasters that may have been wrongly assigned via unlabeled
 * Wikidata coordinate snaps (Knightmare / Camelot pattern).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/audit-coord-snap-parks.ts
 *   npx tsx --env-file=.env.local scripts/audit-coord-snap-parks.ts --snapshot PATH
 */
import fs from "node:fs";
import path from "node:path";
import { arg, hasFlag, runMain } from "./lib/cli";
import { createServiceRoleClient } from "./lib/supabase-service";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import { haversineKm } from "../src/lib/geo";
import {
  findNearestParkForCoords,
  isCatalogHiddenParkName,
  isLikelyWaterParkName,
  type ParkForMatch,
} from "../src/lib/park-match";
import type { WikidataCoasterRow } from "../src/lib/wikidata-coasters";

type ParkRow = ParkForMatch & {
  external_source?: string | null;
  external_id?: string | null;
};

type CoasterRow = {
  id: number;
  name: string;
  park_id: number;
  wikidata_id: string | null;
  status: string | null;
  enwiki_title: string | null;
  summary_text: string | null;
};

const EU_UK = /united kingdom|england|scotland|wales|northern ireland|ireland|france|germany|spain|italy|netherlands|belgium|austria|switzerland|poland|sweden|norway|denmark|finland|portugal|czech|hungary|greece|romania|bulgaria|croatia|slovakia|slovenia|luxembourg|monaco|andorra|liechtenstein|malta|cyprus|estonia|latvia|lithuania|iceland|serbia|ukraine|russia|turkey|israel/i;

function latestProcessedRunDir(): string {
  const root = path.join(process.cwd(), "data", "processed", "wikidata");
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "test-fixture")
    .map((d) => d.name)
    .sort();
  if (!dirs.length) throw new Error(`No processed Wikidata runs under ${root}`);
  return path.join(root, dirs[dirs.length - 1]!);
}

function parkMentionInText(text: string | null | undefined, parkName: string): boolean {
  if (!text?.trim() || !parkName.trim()) return false;
  const t = text.toLowerCase();
  const p = parkName.toLowerCase();
  if (t.includes(p)) return true;
  // Drop common suffixes for looser match
  const short = p
    .replace(/\b(theme park|amusement park|pleasure beach|park|world|resort)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return short.length >= 5 && t.includes(short);
}

function extractParkHint(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  // "at X", "located at X", "in X Theme Park"
  const m =
    text.match(
      /\b(?:at|in|located at|located in|operated at|built at)\s+([A-Z][^.;\n]{4,60}?(?:Theme Park|Amusement Park|Pleasure Beach|World|Land|Gardens|Park))\b/,
    ) ??
    text.match(/\bis a .+? (?:at|in)\s+([A-Z][^.;\n]{4,60}?)\s+(?:in|near|on)\b/);
  return m?.[1]?.trim() ?? null;
}

async function main() {
  const runDir = arg("--run") ?? (hasFlag("--latest") || !arg("--snapshot") ? latestProcessedRunDir() : null);
  const snapshotPath =
    arg("--snapshot") ?? (runDir ? path.join(runDir, "coasters.json") : null);
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    throw new Error("Provide --snapshot PATH or --latest");
  }

  const wdRows = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as WikidataCoasterRow[];
  const wdByQid = new Map<string, WikidataCoasterRow>();
  for (const r of wdRows) {
    const q = r.wikidataId?.trim().toUpperCase();
    if (q) wdByQid.set(q, r);
  }

  const supabase = createServiceRoleClient();
  const { data: parks, error: parkErr } = await fetchAllPages<ParkRow>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("parks")
        .select("id, name, country, latitude, longitude, external_source, external_id")
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (parkErr) throw parkErr;

  const { data: coasters, error: coasterErr } = await fetchAllPages<CoasterRow>(
    SUPABASE_PAGE_SIZE,
    (from, to) =>
      supabase
        .from("coasters")
        .select("id, name, park_id, wikidata_id, status, enwiki_title, summary_text")
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (coasterErr) throw coasterErr;

  const parkById = new Map(parks.map((p) => [p.id, p]));
  const realParks = parks.filter(
    (p) => !isCatalogHiddenParkName(p.name) && !isLikelyWaterParkName(p.name),
  );

  // --- 1) Snapshot: no parkLabel but with coords (UK/EU priority) ---
  const unlabeled = wdRows.filter(
    (r) =>
      !r.parkLabel?.trim() &&
      !r.parkWikidataId?.trim() &&
      r.latitude != null &&
      r.longitude != null &&
      Number.isFinite(r.latitude) &&
      Number.isFinite(r.longitude),
  );

  type SnapRisk = {
    qid: string;
    name: string;
    country: string | null;
    lat: number;
    lon: number;
    nearestPark: string | null;
    nearestKm: number | null;
    within8: boolean;
    within35: boolean;
    secondPark: string | null;
    secondKm: number | null;
    gapKm: number | null;
    region: "uk_eu" | "other";
  };

  const snapRisks: SnapRisk[] = [];
  for (const r of unlabeled) {
    const lat = r.latitude!;
    const lon = r.longitude!;
    const scored = realParks
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({
        park: p,
        d: haversineKm(lat, lon, p.latitude!, p.longitude!),
      }))
      .sort((a, b) => a.d - b.d);

    const n1 = scored[0];
    const n2 = scored[1];
    const within8 = Boolean(
      findNearestParkForCoords(realParks, lat, lon, 8, r.countryLabel),
    );
    const within35 = Boolean(
      findNearestParkForCoords(realParks, lat, lon, 35, r.countryLabel),
    );
    const region = EU_UK.test(r.countryLabel ?? "") ? "uk_eu" : "other";
    snapRisks.push({
      qid: r.wikidataId ?? "?",
      name: r.label ?? "(no label)",
      country: r.countryLabel,
      lat,
      lon,
      nearestPark: n1?.park.name ?? null,
      nearestKm: n1 ? Math.round(n1.d * 10) / 10 : null,
      within8,
      within35,
      secondPark: n2?.park.name ?? null,
      secondKm: n2 ? Math.round(n2.d * 10) / 10 : null,
      gapKm: n1 && n2 ? Math.round((n2.d - n1.d) * 10) / 10 : null,
      region,
    });
  }

  // High risk: would snap under old 35km but NOT under 8km, OR nearest is far / ambiguous
  const highRiskSnap = snapRisks
    .filter((s) => {
      if (!s.within35) return false; // never would have snapped
      if (!s.within8) return true; // old radius would snap, new wouldn't — classic Knightmare class
      // ambiguous: second park within 12km of first
      if (s.nearestKm != null && s.secondKm != null && s.secondKm - s.nearestKm < 12 && s.nearestKm > 3)
        return true;
      return false;
    })
    .sort((a, b) => {
      if (a.region !== b.region) return a.region === "uk_eu" ? -1 : 1;
      return (b.nearestKm ?? 0) - (a.nearestKm ?? 0);
    });

  // --- 2) DB cross-check: coasters with WD coords vs assigned park ---
  type DbFlag = {
    id: number;
    name: string;
    qid: string;
    currentPark: string;
    parkIsPlaceholder: boolean;
    distKm: number | null;
    wdParkLabel: string | null;
    suggestedBy35: string | null;
    suggestedBy8: string | null;
    wikiHint: string | null;
    wikiDisagrees: boolean;
    reasons: string[];
  };

  const flags: DbFlag[] = [];
  for (const c of coasters) {
    const qid = c.wikidata_id?.trim().toUpperCase();
    if (!qid) continue;
    const wd = wdByQid.get(qid);
    if (!wd || wd.latitude == null || wd.longitude == null) continue;
    const park = parkById.get(c.park_id);
    if (!park) continue;

    const reasons: string[] = [];
    const parkIsPlaceholder = isCatalogHiddenParkName(park.name);
    let distKm: number | null = null;
    if (park.latitude != null && park.longitude != null) {
      distKm = Math.round(haversineKm(wd.latitude, wd.longitude, park.latitude, park.longitude) * 10) / 10;
    }

    const by8 = findNearestParkForCoords(realParks, wd.latitude, wd.longitude, 8, wd.countryLabel);
    const by35 = findNearestParkForCoords(realParks, wd.latitude, wd.longitude, 35, wd.countryLabel);

    if (!parkIsPlaceholder && distKm != null && distKm > 8) {
      reasons.push(`WD coords ${distKm}km from assigned park (>8km)`);
    }
    if (!parkIsPlaceholder && !wd.parkLabel?.trim() && by35 && by35.id === park.id && (!by8 || by8.id !== park.id)) {
      reasons.push("likely old 35km unlabeled snap (outside 8km)");
    }
    if (!parkIsPlaceholder && !wd.parkLabel?.trim() && by8 && by8.id !== park.id && distKm != null && distKm > 8) {
      reasons.push(`8km nearest is "${by8.name}" not assigned`);
    }

    const wikiText = [c.enwiki_title, c.summary_text, wd.enwikiTitle].filter(Boolean).join(" | ");
    const wikiHint = extractParkHint(c.summary_text) ?? extractParkHint(wd.enwikiTitle);
    let wikiDisagrees = false;
    if (!parkIsPlaceholder && wikiText && !parkMentionInText(wikiText, park.name)) {
      // Only flag if another real park is mentioned
      const mentioned = realParks.find(
        (p) => p.id !== park.id && parkMentionInText(wikiText, p.name) && p.name.length >= 6,
      );
      if (mentioned) {
        wikiDisagrees = true;
        reasons.push(`wiki/summary mentions "${mentioned.name}" not "${park.name}"`);
      } else if (wikiHint && !parkMentionInText(wikiHint, park.name)) {
        wikiDisagrees = true;
        reasons.push(`wiki hint "${wikiHint}" disagrees with "${park.name}"`);
      }
    }

    // Remaining on Other with WD park label or nearby park
    if (parkIsPlaceholder) {
      if (wd.parkLabel?.trim()) reasons.push(`still on placeholder; WD parkLabel="${wd.parkLabel}"`);
      else if (by8) reasons.push(`still on placeholder; nearest within 8km="${by8.name}"`);
      else if (by35) reasons.push(`still on placeholder; nearest within 35km="${by35.name}" (would need park create or override)`);
    }

    if (reasons.length) {
      flags.push({
        id: c.id,
        name: c.name,
        qid,
        currentPark: park.name,
        parkIsPlaceholder,
        distKm,
        wdParkLabel: wd.parkLabel,
        suggestedBy35: by35?.name ?? null,
        suggestedBy8: by8?.name ?? null,
        wikiHint,
        wikiDisagrees,
        reasons,
      });
    }
  }

  // Prioritize: non-placeholder misassigns with distance, then wiki disagree, then placeholders
  flags.sort((a, b) => {
    const score = (f: DbFlag) => {
      let s = 0;
      if (!f.parkIsPlaceholder && f.distKm != null && f.distKm > 8) s += 100 + Math.min(f.distKm, 200);
      if (f.wikiDisagrees) s += 50;
      if (!f.wdParkLabel && f.suggestedBy35 && !f.suggestedBy8) s += 40;
      if (f.parkIsPlaceholder) s += 10;
      if (EU_UK.test(wdByQid.get(f.qid)?.countryLabel ?? "")) s += 15;
      return s;
    };
    return score(b) - score(a);
  });

  // --- 3) Camelot family check ---
  const camelotHints = ["camelot", "whirlwind", "excalibur", "knightmare", "the tower of terror", "joust"];
  const camelotWd = wdRows.filter((r) => {
    const blob = `${r.label ?? ""} ${r.parkLabel ?? ""} ${r.enwikiTitle ?? ""}`.toLowerCase();
    return camelotHints.some((h) => blob.includes(h));
  });

  const outDir = path.join(process.cwd(), "data", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `coord-snap-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  const report = {
    snapshot: snapshotPath,
    unlabeledWithCoords: unlabeled.length,
    unlabeledUkEu: snapRisks.filter((s) => s.region === "uk_eu").length,
    highRiskUnlabeledSnapWouldDiffer8vs35: highRiskSnap.length,
    highRiskUkEu: highRiskSnap.filter((s) => s.region === "uk_eu"),
    highRiskOtherSample: highRiskSnap.filter((s) => s.region === "other").slice(0, 40),
    dbFlagsTotal: flags.length,
    dbFlagsMisassignedSample: flags.filter((f) => !f.parkIsPlaceholder).slice(0, 60),
    dbFlagsPlaceholderSample: flags.filter((f) => f.parkIsPlaceholder).slice(0, 40),
    camelotRelatedWd: camelotWd.map((r) => ({
      qid: r.wikidataId,
      label: r.label,
      parkLabel: r.parkLabel,
      country: r.countryLabel,
      lat: r.latitude,
      lon: r.longitude,
      status: r.status,
      enwiki: r.enwikiTitle,
    })),
    camelotInDb: coasters
      .filter((c) => {
        const p = parkById.get(c.park_id);
        return (
          p?.name === "Camelot Theme Park" ||
          /camelot|knightmare/i.test(`${c.name} ${c.enwiki_title ?? ""} ${c.summary_text ?? ""}`)
        );
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        qid: c.wikidata_id,
        park: parkById.get(c.park_id)?.name,
      })),
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.error(`Wrote ${outPath}`);
  console.error(
    JSON.stringify(
      {
        unlabeledWithCoords: report.unlabeledWithCoords,
        unlabeledUkEu: report.unlabeledUkEu,
        highRiskDiffer8vs35: report.highRiskUnlabeledSnapWouldDiffer8vs35,
        highRiskUkEuCount: report.highRiskUkEu.length,
        dbMisassigned: report.dbFlagsMisassignedSample.length,
        dbPlaceholderFlags: report.dbFlagsPlaceholderSample.length,
        camelotWd: report.camelotRelatedWd.length,
        camelotDb: report.camelotInDb.length,
      },
      null,
      2,
    ),
  );

  console.log("\n=== HIGH RISK UK/EU unlabeled (35km would snap, 8km would not / ambiguous) ===");
  for (const s of report.highRiskUkEu.slice(0, 40)) {
    console.log(
      `${s.name} (${s.qid}) ${s.country} nearest=${s.nearestPark} ${s.nearestKm}km` +
        (s.within8 ? "" : " [OUTSIDE 8km]") +
        (s.secondPark ? ` second=${s.secondPark} ${s.secondKm}km` : ""),
    );
  }

  console.log("\n=== TOP DB MISASSIGNS (real parks, distance/wiki) ===");
  for (const f of report.dbFlagsMisassignedSample.slice(0, 40)) {
    console.log(
      `#${f.id} ${f.name} (${f.qid}) @ ${f.currentPark} dist=${f.distKm}km` +
        ` 8km=${f.suggestedBy8 ?? "-"} 35km=${f.suggestedBy35 ?? "-"} wdPark=${f.wdParkLabel ?? "null"}`,
    );
    for (const r of f.reasons) console.log(`    - ${r}`);
  }

  console.log("\n=== CAMELOT WD HITS ===");
  for (const r of report.camelotRelatedWd) {
    console.log(`${r.label} (${r.qid}) parkLabel=${r.parkLabel} @ ${r.lat},${r.lon} ${r.country}`);
  }
  console.log("\n=== CAMELOT DB ===");
  for (const r of report.camelotInDb) {
    console.log(`#${r.id} ${r.name} (${r.qid}) @ ${r.park}`);
  }
}

runMain(main);
