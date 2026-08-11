import {
  isPlaceholderCoasterName,
  normalizeCoasterDedupKey,
} from "@/lib/coaster-dedup";
import { haversineKm } from "@/lib/geo";
import type { WikidataCoasterRow } from "@/lib/wikidata-coasters";

import type { DedupeAnalysisReport, QualityFinding } from "../types";

const PROXIMATE_KM = 0.5;
const NAME_SIMILARITY_MIN = 0.86;
const STAT_CONFLICT_RATIO = 0.15;

export function snapshotParkKey(row: WikidataCoasterRow): string {
  if (row.parkWikidataId) return `wd:${row.parkWikidataId.toUpperCase()}`;
  if (row.parkLabel?.trim()) {
    return `label:${(row.countryLabel ?? "").trim().toLowerCase()}:${row.parkLabel.trim().toLowerCase()}`;
  }
  return `orphan:${(row.countryLabel ?? "unknown").trim().toLowerCase()}`;
}

export function stableSyntheticParkId(parkKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < parkKey.length; i++) {
    h ^= parkKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 900_000_000 + 1;
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length - 1 + (b.length - 1));
}

function statConflict(a: number, b: number): boolean {
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return false;
  return Math.abs(a - b) / max > STAT_CONFLICT_RATIO;
}

function countBySeverity(findings: QualityFinding[]) {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
}

export function analyzeDedupeAndConflicts(
  rows: WikidataCoasterRow[],
): DedupeAnalysisReport {
  const findings: QualityFinding[] = [];
  const byParkNameKey = new Map<string, WikidataCoasterRow[]>();
  const byPark = new Map<string, WikidataCoasterRow[]>();

  for (const row of rows) {
    const parkKey = snapshotParkKey(row);
    const parkRows = byPark.get(parkKey) ?? [];
    parkRows.push(row);
    byPark.set(parkKey, parkRows);

    const nameKey = normalizeCoasterDedupKey(row.label);
    if (!nameKey) continue;
    const groupKey = `${parkKey}|${nameKey}`;
    const group = byParkNameKey.get(groupKey) ?? [];
    group.push(row);
    byParkNameKey.set(groupKey, group);

    if (isPlaceholderCoasterName(row.label)) {
      findings.push({
        severity: "warning",
        code: "placeholder_label",
        message: `Label is a Wikidata placeholder (${row.label})`,
        wikidataId: row.wikidataId,
        label: row.label,
        details: { parkKey },
      });
    }
  }

  let duplicateGroups = 0;
  for (const [groupKey, group] of byParkNameKey) {
    const qids = [...new Set(group.map((r) => r.wikidataId.toUpperCase()))];
    if (qids.length <= 1) continue;
    duplicateGroups += 1;
    findings.push({
      severity: "error",
      code: "duplicate_name_same_park",
      message: `${qids.length} Wikidata items share park+name key`,
      label: group[0]?.label,
      details: {
        groupKey,
        wikidataIds: qids,
        labels: [...new Set(group.map((r) => r.label))],
      },
    });

    const operating = group.filter((r) => r.status === "operating");
    const defunct = group.filter((r) => r.status === "defunct");
    if (operating.length > 0 && defunct.length > 0) {
      findings.push({
        severity: "warning",
        code: "conflicting_status",
        message: "Same park+name group mixes operating and defunct statuses",
        label: group[0]?.label,
        details: { wikidataIds: qids, operating: operating.length, defunct: defunct.length },
      });
    }

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (
          a.heightFt != null &&
          b.heightFt != null &&
          statConflict(a.heightFt, b.heightFt)
        ) {
          findings.push({
            severity: "warning",
            code: "conflicting_stats",
            message: `Height differs: ${Math.round(a.heightFt)} ft vs ${Math.round(b.heightFt)} ft`,
            wikidataId: a.wikidataId,
            label: a.label,
            details: {
              otherWikidataId: b.wikidataId,
              field: "heightFt",
              a: a.heightFt,
              b: b.heightFt,
            },
          });
        }
        if (
          a.speedMph != null &&
          b.speedMph != null &&
          statConflict(a.speedMph, b.speedMph)
        ) {
          findings.push({
            severity: "warning",
            code: "conflicting_stats",
            message: `Speed differs: ${Math.round(a.speedMph)} mph vs ${Math.round(b.speedMph)} mph`,
            wikidataId: a.wikidataId,
            label: a.label,
            details: {
              otherWikidataId: b.wikidataId,
              field: "speedMph",
              a: a.speedMph,
              b: b.speedMph,
            },
          });
        }
      }
    }
  }

  let proximatePairs = 0;
  for (const parkRows of byPark.values()) {
    if (parkRows.length < 2) continue;
    for (let i = 0; i < parkRows.length; i++) {
      for (let j = i + 1; j < parkRows.length; j++) {
        const a = parkRows[i];
        const b = parkRows[j];
        if (a.wikidataId.toUpperCase() === b.wikidataId.toUpperCase()) continue;
        if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
          continue;
        }
        const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
        if (km > PROXIMATE_KM) continue;
        const sim = diceCoefficient(
          normalizeCoasterDedupKey(a.label),
          normalizeCoasterDedupKey(b.label),
        );
        if (sim < NAME_SIMILARITY_MIN) continue;
        proximatePairs += 1;
        findings.push({
          severity: sim >= 0.95 ? "warning" : "info",
          code: "proximate_similar_name",
          message: `Similar names ${Math.round(km * 1000)}m apart (similarity ${sim.toFixed(2)})`,
          wikidataId: a.wikidataId,
          label: a.label,
          details: {
            otherWikidataId: b.wikidataId,
            otherLabel: b.label,
            distanceKm: Number(km.toFixed(3)),
            similarity: Number(sim.toFixed(3)),
          },
        });
      }
    }
  }

  const severity = countBySeverity(findings);
  return {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    parksWithLabel: [...byPark.keys()].filter((k) => !k.startsWith("orphan:")).length,
    summary: {
      ...severity,
      duplicateGroups,
      proximatePairs,
      conflictFindings: findings.filter((f) =>
        f.code.startsWith("conflicting"),
      ).length,
    },
    findings,
  };
}

export function groupSnapshotByPark(rows: WikidataCoasterRow[]): Map<string, WikidataCoasterRow[]> {
  const byPark = new Map<string, WikidataCoasterRow[]>();
  for (const row of rows) {
    if (!row.parkLabel?.trim()) continue;
    const key = snapshotParkKey(row);
    const arr = byPark.get(key) ?? [];
    arr.push(row);
    byPark.set(key, arr);
  }
  return byPark;
}
