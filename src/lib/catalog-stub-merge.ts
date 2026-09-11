/**
 * Find same-park former-name / spelling stubs (no Wikidata id) that should merge
 * into a Wikidata-backed row — e.g. "Jubilee Odyssey" → "The Odyssey".
 */

import {
  coastersShareDedupBucket,
  preferCoasterForDedup,
} from "@/lib/coaster-dedup";
import {
  aliasKeyFromName,
  buildAliasLookup,
  coasterAliasKeys,
  type AliasLookup,
  type DbAliasRow,
} from "@/lib/data-platform/coaster-aliases";
import type { Coaster } from "@/types/domain";

export type StubMergePair = {
  stubId: number;
  keepId: number;
  stubName: string;
  keepName: string;
  parkId: number;
  reason: "dedup_key" | "alias";
};

type MergeCandidate = Pick<Coaster, "id" | "park_id" | "name" | "wikidata_id"> &
  Partial<
    Pick<
      Coaster,
      | "coaster_type"
      | "manufacturer"
      | "status"
      | "image_url"
      | "height_ft"
      | "speed_mph"
      | "length_ft"
      | "inversions"
      | "duration_s"
    >
  >;

function hasWikidataId(c: MergeCandidate): boolean {
  return Boolean(c.wikidata_id?.trim());
}

function namesShareAlias(
  a: MergeCandidate,
  b: MergeCandidate,
  lookup: AliasLookup,
): boolean {
  const keysA = coasterAliasKeys(a.name, lookup, a.park_id);
  const keySetB = new Set(coasterAliasKeys(b.name, lookup, b.park_id));
  return keysA.some((k) => keySetB.has(k));
}

/**
 * Pair stub rows (no Wikidata id) with a Wikidata-backed twin in the same park
 * when dedup keys or approved aliases say they are the same ride.
 */
export function findFormerNameStubMerges(
  coasters: MergeCandidate[],
  aliasRows: DbAliasRow[] = [],
): StubMergePair[] {
  const lookup = buildAliasLookup(aliasRows);
  const byPark = new Map<number, MergeCandidate[]>();
  for (const c of coasters) {
    if (!c.name?.trim() || c.park_id == null) continue;
    const list = byPark.get(c.park_id) ?? [];
    list.push(c);
    byPark.set(c.park_id, list);
  }

  const pairs: StubMergePair[] = [];
  const stubClaimed = new Set<number>();

  for (const [parkId, parkRows] of byPark) {
    const stubs = parkRows.filter((c) => !hasWikidataId(c));
    const keeps = parkRows.filter((c) => hasWikidataId(c));
    if (stubs.length === 0 || keeps.length === 0) continue;

    for (const stub of stubs) {
      if (stubClaimed.has(stub.id)) continue;

      let best: { keep: MergeCandidate; reason: StubMergePair["reason"] } | null = null;
      for (const keep of keeps) {
        const asCoaster = (c: MergeCandidate): Coaster =>
          ({
            id: c.id,
            park_id: c.park_id,
            name: c.name,
            wikidata_id: c.wikidata_id ?? null,
            coaster_type: c.coaster_type ?? "Unknown",
            manufacturer: c.manufacturer ?? null,
            status: c.status ?? "Operating",
            image_url: c.image_url ?? null,
            height_ft: c.height_ft ?? null,
            speed_mph: c.speed_mph ?? null,
            length_ft: c.length_ft ?? null,
            inversions: c.inversions ?? null,
            duration_s: c.duration_s ?? null,
            opening_year: null,
            closing_year: null,
          }) as Coaster;

        const stubC = asCoaster(stub);
        const keepC = asCoaster(keep);
        let reason: StubMergePair["reason"] | null = null;
        if (coastersShareDedupBucket(stubC, keepC)) reason = "dedup_key";
        else if (namesShareAlias(stub, keep, lookup)) reason = "alias";
        if (!reason) continue;

        // PreferCoasterForDedup should keep the Wikidata row; if it somehow
        // prefers the stub, skip — we never delete a Q-id row for a stub.
        const preferred = preferCoasterForDedup(stubC, keepC);
        if (preferred.id !== keep.id) continue;

        if (!best || keep.id < best.keep.id) {
          best = { keep, reason };
        }
      }

      if (!best) continue;
      stubClaimed.add(stub.id);
      pairs.push({
        stubId: stub.id,
        keepId: best.keep.id,
        stubName: stub.name,
        keepName: best.keep.name,
        parkId,
        reason: best.reason,
      });
    }
  }

  return pairs;
}

/** Suggested alias row when merging a former-name stub (key_a < key_b). */
export function aliasKeysForStubMerge(stubName: string, keepName: string): {
  key_a: string;
  key_b: string;
} | null {
  const a = aliasKeyFromName(stubName);
  const b = aliasKeyFromName(keepName);
  if (!a || !b || a === b) return null;
  return a < b ? { key_a: a, key_b: b } : { key_a: b, key_b: a };
}
