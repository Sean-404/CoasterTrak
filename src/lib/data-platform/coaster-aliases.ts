/**
 * Load coaster name alias equivalences from the database (Phase 2).
 * Replaces hard-coded alias groups in TypeScript.
 */

import { normalizeCoasterDedupKey } from "../coaster-dedup";
import { stripThemeParksTrademarkArtifacts } from "./themeparks-match-normalize";

export type DbAliasRow = {
  key_a: string;
  key_b: string;
  park_id: number | null;
  approved?: boolean;
};

export type AliasLookup = {
  /** key → set of equivalent keys (includes self). */
  global: Map<string, Set<string>>;
  /** park_id → key → set of equivalent keys */
  byPark: Map<number, Map<string, Set<string>>>;
};

export function aliasKeyFromName(name: string): string {
  return normalizeCoasterDedupKey(stripThemeParksTrademarkArtifacts(name));
}

export function buildAliasLookup(rows: DbAliasRow[]): AliasLookup {
  const global = new Map<string, Set<string>>();
  const byPark = new Map<number, Map<string, Set<string>>>();

  function link(map: Map<string, Set<string>>, a: string, b: string) {
    if (!a || !b || a === b) return;
    const setA = map.get(a) ?? new Set([a]);
    const setB = map.get(b) ?? new Set([b]);
    const merged = new Set([...setA, ...setB, a, b]);
    for (const k of merged) map.set(k, merged);
  }

  for (const row of rows) {
    if (row.approved === false) continue;
    const a = row.key_a.trim();
    const b = row.key_b.trim();
    if (!a || !b) continue;
    if (row.park_id == null) {
      link(global, a, b);
    } else {
      let parkMap = byPark.get(row.park_id);
      if (!parkMap) {
        parkMap = new Map();
        byPark.set(row.park_id, parkMap);
      }
      link(parkMap, a, b);
    }
  }

  return { global, byPark };
}

/** All normalized keys equivalent to this ride name (global + optional park scope). */
export function coasterAliasKeys(
  name: string,
  lookup: AliasLookup,
  parkId?: number | null,
): string[] {
  const primary = aliasKeyFromName(name);
  if (!primary) return [];

  const keys = new Set<string>([primary]);

  const addFromMap = (map: Map<string, Set<string>> | undefined) => {
    if (!map) return;
    const group = map.get(primary);
    if (group) for (const k of group) keys.add(k);
  };

  addFromMap(lookup.global);
  if (parkId != null) addFromMap(lookup.byPark.get(parkId));

  return [...keys];
}
