"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CompareShareCard } from "@/components/stats-compare-share-card";
import { ShareCardCapture } from "@/components/stats-share-controls";
import { UnitsToggle } from "@/components/units-toggle";
import { useUnits } from "@/components/providers";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { cleanCoasterName, matchesSearchQuery } from "@/lib/display";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { loadRideCreditSummaries, summariesByCoasterId } from "@/lib/ride-log";
import { coasterSlug, parkSlug } from "@/lib/slug";
import {
  buildCompareTotals,
  buildCreditOverlap,
  buildParkHeadToHead,
  compareDelta,
  creditsForPark,
  filterCompareCredits,
  firstNested,
  formatCompareDuration,
  formatRecordDetail,
  toCompareCredit,
  type CompareBucket,
  type CompareCredit,
  type CompareDelta,
} from "@/lib/stats-compare";
import { fmtHeight, fmtLength, fmtSpeed } from "@/lib/units";

const INITIAL_VISIBLE = 50;
const LOAD_MORE_STEP = 50;
const PARK_PREVIEW = 8;

type StatsComparePanelProps = {
  myUserId: string;
  theirName: string;
  theirCredits: CompareCredit[];
  includeFamilyRides: boolean;
  onIncludeFamilyRidesChange: (value: boolean) => void;
};

type FetchedCoaster = {
  park_id?: number | null;
  name: string;
  coaster_type?: string | null;
  manufacturer?: string | null;
  length_ft?: number | null;
  speed_mph?: number | null;
  height_ft?: number | null;
  inversions?: number | null;
  duration_s?: number | null;
  status?: string | null;
  parks?:
    | { name?: string | null; country?: string | null }
    | { name?: string | null; country?: string | null }[]
    | null;
};

function deltaClass(winner: CompareDelta["winner"]): string {
  if (winner === "you") return "font-semibold text-emerald-700";
  if (winner === "them") return "font-semibold text-amber-800";
  return "text-slate-500";
}

function mapFetchedRide(
  row: { coaster_id: number; coasters: FetchedCoaster | FetchedCoaster[] | null },
  totalRides: number,
): CompareCredit {
  const raw = firstNested(row.coasters);
  const park = firstNested(raw?.parks);
  const fixed = raw
    ? applyCoasterKnownFixes({
        name: raw.name,
        coaster_type: raw.coaster_type ?? "",
        manufacturer: raw.manufacturer,
        length_ft: raw.length_ft,
        speed_mph: raw.speed_mph,
        height_ft: raw.height_ft,
        inversions: raw.inversions,
        duration_s: raw.duration_s,
        status: raw.status ?? undefined,
      })
    : null;
  return toCompareCredit({
    coasterId: row.coaster_id,
    name: fixed?.name ?? raw?.name ?? `Coaster ${row.coaster_id}`,
    parkId: raw?.park_id ?? null,
    parkName: park?.name ?? null,
    country: park?.country ?? null,
    coasterType: fixed?.coaster_type ?? raw?.coaster_type,
    manufacturer: fixed?.manufacturer ?? raw?.manufacturer,
    lengthFt: fixed?.length_ft ?? raw?.length_ft,
    speedMph: fixed?.speed_mph ?? raw?.speed_mph,
    heightFt: fixed?.height_ft ?? raw?.height_ft,
    inversions: fixed?.inversions ?? raw?.inversions,
    durationS: fixed?.duration_s ?? raw?.duration_s,
    totalRides,
    status: fixed?.status ?? raw?.status,
  });
}

export function StatsComparePanel({
  myUserId,
  theirName,
  theirCredits,
  includeFamilyRides,
  onIncludeFamilyRidesChange,
}: StatsComparePanelProps) {
  const { units, setUnits } = useUnits();
  const [myCredits, setMyCredits] = useState<CompareCredit[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [bucket, setBucket] = useState<CompareBucket>("only-them");
  const [parkKey, setParkKey] = useState<string>("");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState({ key: "only-them|||false", count: INITIAL_VISIBLE });
  const [showAllParks, setShowAllParks] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;

    void (async () => {
      const [ridesRes, summariesRes] = await Promise.all([
        supabase
          .from("rides")
          .select(
            "coaster_id, coasters(park_id, name, coaster_type, manufacturer, length_ft, speed_mph, height_ft, inversions, duration_s, status, parks(name, country))",
          )
          .eq("user_id", myUserId),
        loadRideCreditSummaries(supabase, myUserId),
      ]);
      if (cancelled) return;
      if (ridesRes.error) {
        setLoadError(true);
        setMyCredits([]);
        return;
      }
      const summaryMap = summariesByCoasterId(summariesRes.summaries);
      const rows = (ridesRes.data ?? []) as {
        coaster_id: number;
        coasters: FetchedCoaster | FetchedCoaster[] | null;
      }[];
      setLoadError(false);
      setMyCredits(
        rows.map((row) =>
          mapFetchedRide(row, summaryMap.get(row.coaster_id)?.totalRides ?? 1),
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [myUserId]);

  const mine = useMemo(
    () => filterCompareCredits(myCredits ?? [], includeFamilyRides),
    [includeFamilyRides, myCredits],
  );
  const theirs = useMemo(
    () => filterCompareCredits(theirCredits, includeFamilyRides),
    [includeFamilyRides, theirCredits],
  );
  const parks = useMemo(() => buildParkHeadToHead(mine, theirs), [mine, theirs]);
  const scopedMine = useMemo(() => creditsForPark(mine, parkKey || null), [mine, parkKey]);
  const scopedTheirs = useMemo(
    () => creditsForPark(theirs, parkKey || null),
    [parkKey, theirs],
  );
  const overlap = useMemo(
    () => buildCreditOverlap(scopedMine, scopedTheirs),
    [scopedMine, scopedTheirs],
  );
  const overallOverlap = useMemo(() => buildCreditOverlap(mine, theirs), [mine, theirs]);
  const myTotals = useMemo(() => buildCompareTotals(mine), [mine]);
  const theirTotals = useMemo(() => buildCompareTotals(theirs), [theirs]);
  const selectedPark = parkKey ? parks.find((park) => park.key === parkKey) ?? null : null;

  const bucketCredits =
    bucket === "both" ? overlap.both : bucket === "only-you" ? overlap.onlyYou : overlap.onlyThem;

  const filteredCredits = useMemo(() => {
    const q = query.trim();
    if (!q) return bucketCredits;
    return bucketCredits.filter((credit) =>
      matchesSearchQuery(`${cleanCoasterName(credit.name)} ${credit.parkName ?? ""}`, q),
    );
  }, [bucketCredits, query]);

  const filterKey = `${bucket}|${parkKey}|${query}|${includeFamilyRides}`;
  const visibleCount = visible.key === filterKey ? visible.count : INITIAL_VISIBLE;
  const visibleCredits = filteredCredits.slice(0, visibleCount);
  const visibleParks = showAllParks ? parks : parks.slice(0, PARK_PREVIEW);

  const shareCard = {
    theirName,
    bothCount: overallOverlap.both.length,
    onlyYouCount: overallOverlap.onlyYou.length,
    onlyThemCount: overallOverlap.onlyThem.length,
    yourCredits: myTotals.uniqueCoasters,
    theirCredits: theirTotals.uniqueCoasters,
    filterNote: includeFamilyRides ? "Including family rides" : "Thrill rides focus",
  };

  async function copySummary() {
    const lines = [
      `You vs ${theirName}`,
      `Both ridden: ${overallOverlap.both.length}`,
      `Only you: ${overallOverlap.onlyYou.length}`,
      `Only them: ${overallOverlap.onlyThem.length}`,
      "",
      `Unique credits: ${myTotals.uniqueCoasters} vs ${theirTotals.uniqueCoasters} (${compareDelta(myTotals.uniqueCoasters, theirTotals.uniqueCoasters).label})`,
      `Total rides: ${myTotals.totalRides} vs ${theirTotals.totalRides} (${compareDelta(myTotals.totalRides, theirTotals.totalRides).label})`,
      `Parks: ${myTotals.parks} vs ${theirTotals.parks} (${compareDelta(myTotals.parks, theirTotals.parks).label})`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyFeedback("Comparison copied.");
    } catch {
      setCopyFeedback("Could not copy. Please try again.");
    }
  }

  if (myCredits == null) {
    return <p className="text-sm text-slate-500">Loading comparison…</p>;
  }

  if (loadError) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
        Could not load your rides for comparison. Please refresh.
      </p>
    );
  }

  if (mine.length === 0 && theirs.length === 0) {
    return <p className="text-sm text-slate-500">No rides to compare yet.</p>;
  }

  const emptyCopy =
    bucket === "both"
      ? "No rides in common yet."
      : bucket === "only-you"
        ? selectedPark
          ? `You've ridden everything ${theirName} has at this park.`
          : `You've ridden everything ${theirName} has.`
        : selectedPark
          ? `${theirName} hasn't ridden anything here that you haven't.`
          : `${theirName} hasn't ridden anything you haven't.`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">You vs {theirName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Shared credits first, then a single gap table. Park filter is for trip planning.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareCardCapture
            onFeedback={setShareFeedback}
            filename="coastertrak-vs.png"
            shareTitle={`You vs ${theirName} on CoasterTrak`}
            shareText={`${overallOverlap.both.length} rides in common with ${theirName} on CoasterTrak`}
            successShared="Compare card shared."
            successDownloaded="Compare card downloaded."
            failMessage="Could not create the compare card. Please try again."
            renderCard={(ref) => <CompareShareCard ref={ref} {...shareCard} />}
          />
          <button
            type="button"
            onClick={() => void copySummary()}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Copy text
          </button>
        </div>
      </div>
      {(shareFeedback || copyFeedback) && (
        <p className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
          {shareFeedback || copyFeedback}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeFamilyRides}
            onChange={(e) => onIncludeFamilyRidesChange(e.target.checked)}
            className="rounded border-slate-300 text-amber-600 focus:ring-amber-400"
          />
          Include kiddie / family-style rides
        </label>
        <UnitsToggle units={units} onChange={setUnits} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-3 gap-2 sm:max-w-lg sm:flex-1">
            {(
              [
                ["both", "Both ridden", overlap.both.length],
                ["only-you", "Only you", overlap.onlyYou.length],
                ["only-them", "Only them", overlap.onlyThem.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                aria-pressed={bucket === id}
                onClick={() => setBucket(id)}
                className={`rounded-lg border px-2 py-2 text-center ${
                  bucket === id
                    ? "border-amber-400 bg-amber-50 text-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="block text-[11px] font-medium text-slate-500">{label}</span>
                <span className="mt-0.5 block text-lg font-bold tabular-nums">{count.toLocaleString()}</span>
              </button>
            ))}
          </div>
          {parks.length > 0 && (
            <label className="block min-w-0 text-sm text-slate-600 sm:w-64">
              <span className="sr-only">Filter by park</span>
              <select
                value={parkKey}
                onChange={(e) => setParkKey(e.target.value)}
                className="mt-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="">All parks</option>
                {parks.map((park) => (
                  <option key={park.key} value={park.key}>
                    {park.label} ({park.mineCount} / {park.theirsCount})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {selectedPark && (
          <p className="mt-3 text-sm text-slate-600">
            At{" "}
            {selectedPark.parkId != null && selectedPark.parkName ? (
              <Link
                href={`/parks/${parkSlug(selectedPark.parkName, selectedPark.parkId)}`}
                className="font-medium text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-900"
              >
                {selectedPark.label}
              </Link>
            ) : (
              <span className="font-medium text-slate-800">{selectedPark.label}</span>
            )}{" "}
            you&apos;ve ridden {selectedPark.mineCount.toLocaleString()} and {theirName} has ridden{" "}
            {selectedPark.theirsCount.toLocaleString()}.
          </p>
        )}

        {bucketCredits.length > 3 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter rides…"
            aria-label="Filter compared rides"
            className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        )}

        <ul className="mt-3 max-h-[min(50vh,22rem)] overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]">
          {filteredCredits.length === 0 ? (
            <li className="py-2 text-sm text-slate-500">{query.trim() ? "No matches" : emptyCopy}</li>
          ) : (
            visibleCredits.map((credit) => {
              const name = cleanCoasterName(credit.name);
              return (
                <li key={credit.coasterId} className="border-b border-slate-100 py-2 last:border-b-0">
                  <Link
                    href={`/coasters/${coasterSlug(credit.name, credit.coasterId)}`}
                    className="block min-w-0 hover:text-amber-800"
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                    {credit.parkName ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{credit.parkName}</p>
                    ) : null}
                  </Link>
                </li>
              );
            })
          )}
        </ul>
        {filteredCredits.length > visibleCredits.length && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() =>
                setVisible({
                  key: filterKey,
                  count: Math.min(visibleCount + LOAD_MORE_STEP, filteredCredits.length),
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Load more rides
            </button>
          </div>
        )}
      </section>

      {parks.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="font-semibold text-slate-900">Parks</h3>
          <p className="mt-1 text-sm text-slate-500">
            Who&apos;s missing what. Tap a park to filter the list above.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Park</th>
                  <th className="py-2 px-2 text-right font-medium">You</th>
                  <th className="py-2 px-2 text-right font-medium">{theirName}</th>
                  <th className="py-2 pl-2 text-right font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {visibleParks.map((park) => (
                  <tr key={park.key} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => {
                          setParkKey(park.key);
                          setBucket(park.onlyTheirs.length > 0 ? "only-them" : park.onlyMine.length > 0 ? "only-you" : "both");
                        }}
                        className={`text-left font-medium hover:text-amber-800 ${
                          parkKey === park.key ? "text-amber-800" : "text-slate-800"
                        }`}
                      >
                        {park.label}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-700">{park.mineCount}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-700">{park.theirsCount}</td>
                    <td className={`py-2 pl-2 text-right tabular-nums ${deltaClass(park.delta.winner)}`}>
                      {park.delta.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parks.length > PARK_PREVIEW && !showAllParks && (
            <button
              type="button"
              onClick={() => setShowAllParks(true)}
              className="mt-3 text-sm font-medium text-amber-800 hover:text-amber-900"
            >
              Show all {parks.length} parks
            </button>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="font-semibold text-slate-900">Head to head</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Stat</th>
                <th className="py-2 px-2 text-right font-medium">You</th>
                <th className="py-2 px-2 text-right font-medium">{theirName}</th>
                <th className="py-2 pl-2 text-right font-medium">Gap</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Unique credits", myTotals.uniqueCoasters, theirTotals.uniqueCoasters],
                  ["Total rides", myTotals.totalRides, theirTotals.totalRides],
                  ["Parks", myTotals.parks, theirTotals.parks],
                  ["Countries", myTotals.countries, theirTotals.countries],
                  ["Continents", myTotals.continents, theirTotals.continents],
                  ["Inversions", myTotals.totalInversions, theirTotals.totalInversions],
                ] as const
              ).map(([label, mineValue, theirsValue]) => {
                const delta = compareDelta(mineValue, theirsValue);
                return (
                  <tr key={label} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-600">{label}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-900">
                      {mineValue.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-900">
                      {theirsValue.toLocaleString()}
                    </td>
                    <td className={`py-2 pl-2 text-right tabular-nums ${deltaClass(delta.winner)}`}>
                      {delta.label}
                    </td>
                  </tr>
                );
              })}
              <CompareMetricRow
                label="Track length"
                mine={fmtLength(myTotals.totalLengthFt, units) ?? "—"}
                theirs={fmtLength(theirTotals.totalLengthFt, units) ?? "—"}
                delta={compareDelta(myTotals.totalLengthFt, theirTotals.totalLengthFt)}
              />
              <CompareMetricRow
                label="Ride time"
                mine={formatCompareDuration(myTotals.totalDurationS)}
                theirs={formatCompareDuration(theirTotals.totalDurationS)}
                delta={compareDelta(myTotals.totalDurationS, theirTotals.totalDurationS)}
              />
              <CompareMetricRow
                label="Average speed"
                mine={
                  myTotals.averageSpeedMph != null
                    ? (fmtSpeed(Math.round(myTotals.averageSpeedMph), units) ?? "—")
                    : "—"
                }
                theirs={
                  theirTotals.averageSpeedMph != null
                    ? (fmtSpeed(Math.round(theirTotals.averageSpeedMph), units) ?? "—")
                    : "—"
                }
                delta={compareDelta(
                  myTotals.averageSpeedMph ?? 0,
                  theirTotals.averageSpeedMph ?? 0,
                )}
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="font-semibold text-slate-900">Records</h3>
        <ul className="mt-3 space-y-3">
          <RecordRow
            label="Fastest"
            mine={formatRecordDetail(myTotals.fastest, (value) => fmtSpeed(value, units) ?? `${value} mph`)}
            theirs={formatRecordDetail(theirTotals.fastest, (value) => fmtSpeed(value, units) ?? `${value} mph`)}
          />
          <RecordRow
            label="Tallest"
            mine={formatRecordDetail(myTotals.tallest, (value) => fmtHeight(value, units) ?? `${value} ft`)}
            theirs={formatRecordDetail(theirTotals.tallest, (value) => fmtHeight(value, units) ?? `${value} ft`)}
          />
          <RecordRow
            label="Longest"
            mine={formatRecordDetail(myTotals.longest, (value) => fmtLength(value, units) ?? `${value} ft`)}
            theirs={formatRecordDetail(
              theirTotals.longest,
              (value) => fmtLength(value, units) ?? `${value} ft`,
            )}
          />
          <RecordRow
            label="Most inversions"
            mine={formatRecordDetail(myTotals.mostInversions, (value) => value.toLocaleString())}
            theirs={formatRecordDetail(theirTotals.mostInversions, (value) => value.toLocaleString())}
          />
          <RecordRow
            label="Longest ride"
            mine={formatRecordDetail(myTotals.longestDuration, formatCompareDuration)}
            theirs={formatRecordDetail(theirTotals.longestDuration, formatCompareDuration)}
          />
        </ul>
      </section>
    </div>
  );
}

function CompareMetricRow({
  label,
  mine,
  theirs,
  delta,
}: {
  label: string;
  mine: string;
  theirs: string;
  delta: CompareDelta;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="py-2 pr-3 text-slate-600">{label}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-900">{mine}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-900">{theirs}</td>
      <td className={`py-2 pl-2 text-right tabular-nums ${deltaClass(delta.winner)}`}>{delta.label}</td>
    </tr>
  );
}

function RecordRow({
  label,
  mine,
  theirs,
}: {
  label: string;
  mine: string;
  theirs: string;
}) {
  return (
    <li className="grid gap-1 sm:grid-cols-[7.5rem_1fr_1fr] sm:gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">
        <span className="mr-1 text-xs font-medium text-slate-500">You</span>
        {mine}
      </p>
      <p className="text-sm text-slate-800">
        <span className="mr-1 text-xs font-medium text-slate-500">Them</span>
        {theirs}
      </p>
    </li>
  );
}
