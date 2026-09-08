"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/site-header";

const GuessPinMap = dynamic(() => import("@/components/guess-pin-map").then((m) => m.GuessPinMap), {
  ssr: false,
  loading: () => <div className="h-full min-h-40 w-full animate-pulse rounded-xl bg-slate-200 lg:h-[min(65vh,560px)]" />,
});

type LatLng = { lat: number; lng: number };

type Round = {
  token: string;
  imageUrl: string;
};

type Result = {
  gaveUp?: boolean;
  distanceLabel: string | null;
  resultLabel: string;
  score: number;
  coasterName: string;
  parkName: string;
  country: string;
  latitude: number;
  longitude: number;
  coasterHref: string;
  parkHref: string;
};

export default function GuessPage() {
  const [round, setRound] = useState<Round | null>(null);
  const [guess, setGuess] = useState<LatLng | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "scoring" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [mapRound, setMapRound] = useState(0);
  const brokenStreak = useRef(0);
  const loadSeq = useRef(0);
  const submitSeq = useRef(0);

  const loadRound = useCallback(async (excludeToken?: string) => {
    const seq = ++loadSeq.current;
    submitSeq.current += 1;
    if (excludeToken) setMapRound((n) => n + 1);
    setStatus("loading");
    setError(null);
    setGuess(null);
    setResult(null);

    try {
      const query = excludeToken ? `?exclude=${encodeURIComponent(excludeToken)}` : "";
      const response = await fetch(`/api/guess/round${query}`, { cache: "no-store" });
      const payload = (await response.json()) as Round & { error?: string };
      if (seq !== loadSeq.current) return;
      if (!response.ok || !payload.token || !payload.imageUrl) {
        setRound(null);
        setStatus("error");
        setError(payload.error || "Could not load a ride photo.");
        return;
      }
      setRound({ token: payload.token, imageUrl: payload.imageUrl });
      setStatus("playing");
    } catch {
      if (seq !== loadSeq.current) return;
      setStatus("error");
      setError("Could not load a ride photo.");
    }
  }, []);

  function skipBrokenPhoto(token: string, seq: number) {
    if (seq !== loadSeq.current) return;
    brokenStreak.current += 1;
    if (brokenStreak.current >= 5) {
      setStatus("error");
      setError("Several catalog photos failed to load. Try again in a minute.");
      return;
    }
    void loadRound(token);
  }

  useEffect(() => {
    void loadRound();
  }, [loadRound]);

  async function submitRound(giveUp: boolean) {
    if (!round || status !== "playing") return;
    if (!giveUp && !guess) return;
    if (giveUp && guess) return;
    const seq = ++submitSeq.current;
    setStatus("scoring");
    setError(null);

    try {
      const response = await fetch("/api/guess/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: round.token,
          giveUp,
          latitude: guess?.lat,
          longitude: guess?.lng,
        }),
      });
      const payload = (await response.json()) as Result & { error?: string };
      if (seq !== submitSeq.current) return;
      if (!response.ok) {
        setStatus("playing");
        setError(payload.error || (giveUp ? "Could not reveal that ride." : "Could not score that pin."));
        return;
      }
      setResult(payload);
      setStatus("playing");
    } catch {
      if (seq !== submitSeq.current) return;
      setStatus("playing");
      setError(giveUp ? "Could not reveal that ride." : "Could not score that pin.");
    }
  }

  function lockIn() {
    void submitRound(false);
  }

  function giveUp() {
    void submitRound(true);
  }

  const revealed = result != null;
  const answer = result ? { lat: result.latitude, lng: result.longitude } : null;

  const canLockIn = Boolean(guess) && !revealed && status === "playing";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 lg:h-auto lg:min-h-screen lg:overflow-visible">
      <SiteHeader />
      <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col overflow-hidden px-3 pt-2 pb-[7.25rem] sm:px-6 lg:overflow-visible lg:px-6 lg:py-6 lg:pb-6">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">CoasterGuessr</p>
          {revealed || guess ? null : (
            <button
              type="button"
              onClick={giveUp}
              disabled={status === "loading" || status === "scoring"}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Show answer
            </button>
          )}
        </div>
        <h1 className="font-bungee mt-1 shrink-0 text-xl leading-none text-slate-900 sm:text-4xl sm:leading-tight">
          Where is this ride?
        </h1>
        <p className="mt-1 hidden max-w-xl shrink-0 text-sm text-slate-600 sm:block">
          Pin the park. The name stays hidden until you lock it in.
        </p>

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        ) : null}

        <div className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:mt-5 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-4">
          <section className="w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="guess-photo relative overflow-hidden bg-slate-100">
              {status === "loading" || !round ? (
                <div className="h-full w-full animate-pulse bg-slate-200" />
              ) : (
                // Catalog images are remote Wikimedia files; next/image remotePatterns are not set up for this POC.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={round.imageUrl}
                  alt="Mystery coaster"
                  className="absolute inset-0 h-full w-full object-contain object-center"
                  onLoad={() => {
                    brokenStreak.current = 0;
                  }}
                  onError={() => {
                    skipBrokenPhoto(round.token, loadSeq.current);
                  }}
                />
              )}
            </div>
            <div className="hidden space-y-3 px-4 py-4 lg:block">
              <ResultCopy
                revealed={revealed}
                result={result}
                playingHint="Drop a pin on the map, then lock it in."
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void lockIn()}
                  disabled={!canLockIn}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {status === "scoring" ? "Scoring…" : "Lock in pin"}
                </button>
                {revealed ? (
                  <button
                    type="button"
                    onClick={() => void loadRound(round?.token)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Next photo
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden lg:h-auto lg:flex-none">
              <GuessPinMap
                guess={guess}
                answer={answer}
                roundKey={String(mapRound)}
                disabled={status !== "playing" || revealed}
                onPick={setGuess}
              />
            </div>
            <p className="hidden text-xs text-slate-500 sm:block">
              {guess && !revealed
                ? "Tap the map again to move the amber pin."
                : "Tap the map to drop a pin. The dark pin is the park after you lock in."}
            </p>
          </section>
        </div>
      </main>

      <div className="fixed inset-x-3 z-20 rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-lg backdrop-blur bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] lg:hidden">
        {revealed && result ? (
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">{result.resultLabel}</p>
              {result.gaveUp ? null : (
                <p className="truncate text-sm font-semibold text-slate-900">
                  {result.score.toLocaleString("en-US")} / 5000 · {result.distanceLabel}
                </p>
              )}
              <p className="truncate text-sm text-slate-700">
                <Link href={result.parkHref} className="font-semibold text-amber-800 underline-offset-2 hover:underline">
                  {result.parkName}
                </Link>
                {" · "}
                <Link href={result.coasterHref} className="font-semibold text-amber-800 underline-offset-2 hover:underline">
                  {result.coasterName}
                </Link>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRound(round?.token)}
              className="shrink-0 rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-semibold text-slate-900"
            >
              Next photo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void lockIn()}
            disabled={!canLockIn}
            className="mx-auto block w-full max-w-6xl rounded-lg bg-amber-500 px-3 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            {status === "scoring" ? "Scoring…" : guess ? "Lock in pin" : "Drop a pin on the map"}
          </button>
        )}
      </div>
    </div>
  );
}

function ResultCopy({
  revealed,
  result,
  playingHint,
}: {
  revealed: boolean;
  result: Result | null;
  playingHint: string;
}) {
  if (revealed && result) {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">{result.resultLabel}</p>
        {result.gaveUp ? null : (
          <p className="font-bungee text-2xl text-slate-900">
            {result.score.toLocaleString("en-US")}{" "}
            <span className="font-sans text-base font-semibold text-slate-500">/ 5000</span>
          </p>
        )}
        <p className="text-sm text-slate-700">
          {result.gaveUp ? (
            <>
              Park:{" "}
              <Link href={result.parkHref} className="font-semibold text-amber-800 underline-offset-2 hover:underline">
                {result.parkName}
              </Link>
            </>
          ) : (
            <>
              {result.distanceLabel} from{" "}
              <Link href={result.parkHref} className="font-semibold text-amber-800 underline-offset-2 hover:underline">
                {result.parkName}
              </Link>
            </>
          )}
          {result.country && result.country !== "Unknown" ? `, ${result.country}` : ""}.
        </p>
        <p className="text-sm text-slate-700">
          Ride:{" "}
          <Link href={result.coasterHref} className="font-semibold text-amber-800 underline-offset-2 hover:underline">
            {result.coasterName}
          </Link>
        </p>
      </>
    );
  }

  return <p className="text-sm text-slate-600">{playingHint}</p>;
}
