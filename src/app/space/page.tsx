"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { KARMAN_LINE_FT } from "@/lib/achievements";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import { useUnits } from "@/components/providers";
import { fmtLength } from "@/lib/units";

type RideLengthRow = {
  coaster_id: number;
  coasters?:
    | {
        name: string;
        wikidata_id?: string | null;
        length_ft: number | null;
      }
    | {
        name: string;
        wikidata_id?: string | null;
        length_ft: number | null;
      }[]
    | null;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function firstCoaster(
  coaster: RideLengthRow["coasters"],
): { name: string; wikidata_id?: string | null; length_ft: number | null } | null {
  if (!coaster) return null;
  return Array.isArray(coaster) ? (coaster[0] ?? null) : coaster;
}

const ALTITUDE_CANVAS_PX = 1400;
const FEET_PER_METER = 3.28084;
const ALTITUDE_MARKERS_METERS = [0, 25_000, 50_000, 75_000, 100_000] as const;
const ROCKET_VISUAL_HEIGHT_PX = 96;
const SCALE_BOTTOM_PADDING_PX = 28;
const SCALE_TOP_PADDING_PX = 72;

function altitudeFeetToBottomPx(feet: number): number {
  const clamped = Math.max(0, Math.min(KARMAN_LINE_FT, feet));
  const ratio = clamped / KARMAN_LINE_FT;
  const usableHeight = ALTITUDE_CANVAS_PX - SCALE_BOTTOM_PADDING_PX - SCALE_TOP_PADDING_PX;
  return SCALE_BOTTOM_PADDING_PX + ratio * usableHeight;
}

export default function SpacePage() {
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [fetchError, setFetchError] = useState(false);
  const [totalTrackLengthFt, setTotalTrackLengthFt] = useState(0);
  const [creditsWithLength, setCreditsWithLength] = useState(0);
  const altitudeScrollRef = useRef<HTMLDivElement | null>(null);
  const { units } = useUnits();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void getSupabaseUserSafe().then(async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("rides")
        .select("coaster_id, coasters(name, wikidata_id, length_ft)")
        .eq("user_id", user.id);

      if (error) {
        setFetchError(true);
        setLoading(false);
        return;
      }

      const uniqueByCoaster = new Map<number, RideLengthRow>();
      for (const row of (data ?? []) as RideLengthRow[]) {
        if (!uniqueByCoaster.has(row.coaster_id)) uniqueByCoaster.set(row.coaster_id, row);
      }

      let total = 0;
      let withLength = 0;
      for (const row of uniqueByCoaster.values()) {
        const coaster = firstCoaster(row.coasters);
        if (!coaster) continue;
        const fixed = applyCoasterKnownFixes(coaster);
        if (fixed.length_ft == null) continue;
        total += fixed.length_ft;
        withLength += 1;
      }

      setTotalTrackLengthFt(total);
      setCreditsWithLength(withLength);
      setLoading(false);
    });
  }, []);

  const progress = useMemo(
    () => Math.max(0, Math.min(1, totalTrackLengthFt / KARMAN_LINE_FT)),
    [totalTrackLengthFt],
  );
  const progressPercent = useMemo(() => pct(progress), [progress]);
  const remainingFt = Math.max(0, KARMAN_LINE_FT - totalTrackLengthFt);
  const userAltitudeFt = progress * KARMAN_LINE_FT;
  const starsOpacity = 0.18 + progress * 0.82;
  const skyTop = `hsl(${Math.round(lerp(220, 250, progress))} 84% ${Math.round(lerp(28, 4, progress))}%)`;
  const skyMid = `hsl(${Math.round(lerp(205, 236, progress))} 82% ${Math.round(lerp(44, 12, progress))}%)`;
  const skyBottom = `hsl(${Math.round(lerp(182, 212, progress))} 76% ${Math.round(lerp(34, 16, progress))}%)`;
  const atmosphereGlowOpacity = 0.42 * (1 - progress);
  const deepSpaceShadeOpacity = 0.3 + progress * 0.55;
  const userLineBottomPx = altitudeFeetToBottomPx(userAltitudeFt);
  const rocketBottomPx = userLineBottomPx - ROCKET_VISUAL_HEIGHT_PX / 2;
  const currentAltitudeKm = (progress * 100).toFixed(1);
  const altitudeMarkers = useMemo(
    () =>
      ALTITUDE_MARKERS_METERS.map((meters) => {
        const bottomPx = altitudeFeetToBottomPx(meters * FEET_PER_METER);
        return {
          meters,
          kmLabel: `${Math.round(meters / 1000)} km`,
          bottomPx,
        };
      }),
    [],
  );

  useEffect(() => {
    if (loading) return;
    const container = altitudeScrollRef.current;
    if (!container) return;
    const target = ALTITUDE_CANVAS_PX - userLineBottomPx - container.clientHeight / 2;
    const maxScroll = Math.max(0, ALTITUDE_CANVAS_PX - container.clientHeight);
    container.scrollTop = Math.max(0, Math.min(maxScroll, target));
  }, [loading, userLineBottomPx]);

  return (
    <div className="min-h-screen bg-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <AuthGate>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Space progress</h1>
            <p className="mt-1 text-sm text-slate-300">
              Ride enough combined track length to reach the Karman line (100 km), the edge of space.
            </p>
          </div>

          {fetchError && (
            <p className="mb-4 rounded-lg bg-red-950/70 px-4 py-2 text-sm text-red-200">
              Could not load ride data right now. Please refresh and try again.
            </p>
          )}

          <section className="rounded-2xl border border-white/15 bg-slate-900/70 p-4 shadow-xl sm:p-5">
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-slate-900/90 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Current progress</p>
                <p className="mt-1 text-2xl font-bold text-amber-300">
                  {loading ? "..." : progressPercent}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/90 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Track logged</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {loading ? "..." : (fmtLength(totalTrackLengthFt, units) ?? `${Math.round(totalTrackLengthFt).toLocaleString()} ft`)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/90 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Remaining to space</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {loading ? "..." : (fmtLength(remainingFt, units) ?? `${Math.round(remainingFt).toLocaleString()} ft`)}
                </p>
              </div>
            </div>
            <p className="mb-3 rounded-md border border-white/10 bg-slate-950/30 px-2.5 py-1.5 text-xs text-slate-300">
              Scroll the sky up or down to explore your journey from ground level to the Karman line.
            </p>

            <div
              ref={altitudeScrollRef}
              className="space-scroll relative h-[28rem] overflow-y-auto rounded-xl border border-white/15 [scrollbar-gutter:stable]"
              style={{ background: `linear-gradient(to top, ${skyBottom}, ${skyMid} 52%, ${skyTop})` }}
            >
              <div className="relative min-h-[1400px] pb-10 pt-8">
                <div
                  className="absolute inset-0"
                  style={{
                    opacity: atmosphereGlowOpacity,
                    background:
                      "radial-gradient(circle at 50% 74%, rgba(125,250,241,0.55), transparent 58%), radial-gradient(circle at 20% 20%, rgba(255,255,255,0.24), transparent 38%)",
                  }}
                />
                <div className="absolute inset-0 bg-slate-950/0 transition-opacity duration-700" style={{ opacity: deepSpaceShadeOpacity }} />
                <div className="absolute inset-0 bg-gradient-to-t from-transparent via-slate-950/25 to-slate-950/80" />

                <div
                  className="pointer-events-none absolute inset-0 transition-opacity duration-700"
                  style={{
                    opacity: starsOpacity,
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px), radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
                    backgroundSize: "90px 90px, 130px 130px",
                    backgroundPosition: "0 0, 32px 24px",
                  }}
                />

                <div className="pointer-events-none absolute inset-0">
                  {altitudeMarkers.map((marker) => (
                    <div
                      key={marker.meters}
                      className="absolute left-3 right-3 sm:left-4 sm:right-4"
                      style={{ bottom: `${marker.bottomPx}px` }}
                    >
                      <div className={`relative ${marker.meters === 100_000 ? "border-t border-dashed border-white/35" : "border-t border-white/20"}`}>
                        <span className={`absolute -top-2 left-0 rounded px-1.5 text-[10px] font-medium ${marker.meters === 100_000 ? "bg-sky-300/85 text-slate-950" : "bg-slate-950/55 text-slate-100"}`}>
                          {marker.meters === 100_000 ? `Karman line · ${marker.kmLabel}` : marker.kmLabel}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div
                    className="absolute left-3 right-3 sm:left-4 sm:right-4"
                    style={{ bottom: `${userLineBottomPx}px` }}
                  >
                    <div className="relative border-t-2 border-amber-300/90">
                      <span className="absolute -top-2 left-0 rounded bg-amber-400/85 px-1.5 text-[10px] font-semibold text-slate-950">
                        You: {currentAltitudeKm} km
                      </span>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-[8%] bg-gradient-to-t from-emerald-900/90 to-transparent" />

                <div
                  className="absolute left-1/2 -translate-x-1/2 transition-[bottom] duration-700"
                  style={{ bottom: `${rocketBottomPx}px` }}
                >
                  <div className="relative h-24 w-14 animate-[space-bob_8.2s_ease-in-out_infinite]">
                    <div className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[11px] border-b-[16px] border-x-transparent border-b-slate-100" />
                    <div className="absolute left-1/2 top-[13px] h-[46px] w-8 -translate-x-1/2 rounded-[12px] border border-slate-200/80 bg-gradient-to-b from-red-500 via-amber-400 to-orange-500">
                      <div className="mx-auto mt-2 flex justify-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-100/95" />
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-100/95" />
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-100/95" />
                      </div>
                      <div className="mx-auto mt-2 h-1 w-5 rounded-full bg-slate-900/35" />
                      <div className="mx-auto mt-1 h-1 w-4 rounded-full bg-slate-900/35" />
                    </div>
                    <div className="absolute left-1/2 top-[50px] h-[22px] w-[42px] -translate-x-1/2 rounded-md border border-slate-200/70 bg-gradient-to-b from-slate-100 to-slate-300">
                      <div className="absolute inset-x-1 top-1 flex justify-between">
                        <span className="h-2 w-2 rounded-sm bg-slate-700/85" />
                        <span className="h-2 w-2 rounded-sm bg-slate-700/85" />
                        <span className="h-2 w-2 rounded-sm bg-slate-700/85" />
                      </div>
                      <div className="absolute -bottom-2 left-1 h-2 w-2 rounded-full bg-slate-900/80" />
                      <div className="absolute -bottom-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-slate-900/80" />
                      <div className="absolute -bottom-2 right-1 h-2 w-2 rounded-full bg-slate-900/80" />
                    </div>
                    <div className="absolute left-[3px] top-[56px] h-3 w-3 rotate-45 rounded-sm bg-amber-300/95" />
                    <div className="absolute right-[3px] top-[56px] h-3 w-3 rotate-45 rounded-sm bg-amber-300/95" />
                    <div className="absolute left-1/2 top-[72px] -translate-x-1/2">
                      <div className="h-8 w-3 rounded-b-full bg-gradient-to-b from-amber-300/95 via-orange-500/95 to-transparent blur-[0.4px] animate-[flame-pulse_2.8s_ease-in-out_infinite]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-3 left-3 right-3 mx-3 rounded-lg border border-white/15 bg-slate-950/45 px-3 py-2 text-xs text-slate-100 sm:text-sm">
                {loading
                  ? "Loading launch telemetry..."
                  : `You've logged ${creditsWithLength.toLocaleString()} coasters with track length data.`}
              </div>
            </div>
          </section>

          <style jsx>{`
            .space-scroll {
              scrollbar-width: thin;
              scrollbar-color: rgba(148, 163, 184, 0.55) rgba(15, 23, 42, 0.4);
            }
            .space-scroll::-webkit-scrollbar {
              width: 8px;
            }
            .space-scroll::-webkit-scrollbar-track {
              background: rgba(15, 23, 42, 0.35);
            }
            .space-scroll::-webkit-scrollbar-thumb {
              background: linear-gradient(to bottom, rgba(148, 163, 184, 0.65), rgba(100, 116, 139, 0.65));
              border-radius: 9999px;
              border: 1px solid rgba(15, 23, 42, 0.45);
            }
            .space-scroll::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(to bottom, rgba(203, 213, 225, 0.8), rgba(148, 163, 184, 0.8));
            }
            @keyframes space-bob {
              0%, 100% {
                transform: translateY(0);
              }
              50% {
                transform: translateY(-2px);
              }
            }
            @keyframes flame-pulse {
              0%, 100% {
                transform: scaleY(0.88);
                opacity: 0.78;
              }
              50% {
                transform: scaleY(1.18);
                opacity: 1;
              }
            }
          `}</style>
        </AuthGate>
      </main>
    </div>
  );
}
