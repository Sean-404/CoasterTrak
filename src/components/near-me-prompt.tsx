"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Park } from "@/types/domain";
import {
  findNearestPark,
  formatDistance,
  isAtPark,
  type LatLng,
  type NearestPark,
} from "@/lib/nearby-park";

type Props = {
  /** Every park with a pin; filters on the map do not apply here. */
  parks: Park[];
  /** Open a park on the map and its ride sheet. */
  onOpenPark: (parkId: number) => void;
  /** The visitor's position, so the map can show a "you are here" dot. */
  onLocated: (here: LatLng | null) => void;
};

type State =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "found"; nearest: NearestPark<Park> | null }
  | { kind: "error"; message: string };

const DISMISSED_KEY = "coastertrak:near-me-dismissed";

function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(value: string) {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, value);
  } catch {
    /* private mode: the prompt may show again, which is fine */
  }
}

function errorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location is turned off for CoasterTrak. You can allow it in your browser settings.";
  }
  if (error.code === error.TIMEOUT) return "Finding your location took too long. Try again.";
  return "Could not find your location.";
}

/**
 * "Find parks near me" for the map. If the browser has already been given location access,
 * it checks quietly when the map opens; otherwise it waits for a tap, so nobody gets a
 * permission prompt they did not ask for. The location stays in the browser.
 */
export function NearMePrompt({ parks, onOpenPark, onLocated }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const autoChecked = useRef(false);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "This browser cannot share your location." });
      return;
    }
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        onLocated(here);
        setState({ kind: "found", nearest: findNearestPark(parks, here) });
      },
      (error) => {
        onLocated(null);
        setState({ kind: "error", message: errorMessage(error) });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, [onLocated, parks]);

  // Quiet check only when permission was granted before; never trigger the browser prompt.
  useEffect(() => {
    if (autoChecked.current || parks.length === 0 || !("geolocation" in navigator)) return;
    autoChecked.current = true;
    const permissions = navigator.permissions;
    if (!permissions?.query) return;
    permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (status.state === "granted") locate();
      })
      .catch(() => {
        /* Permissions API unsupported: wait for the button */
      });
  }, [locate, parks.length]);

  const dismiss = (key: string) => {
    writeDismissed(key);
    setState({ kind: "idle" });
  };

  if (state.kind === "found" && state.nearest && isAtPark(state.nearest)) {
    const { park } = state.nearest;
    if (readDismissed() !== `park:${park.id}`) {
      return (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-slate-800">
            <span className="font-semibold">Are you at {park.name}?</span>{" "}
            <span className="text-slate-600">Open it to log rides as you go.</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                writeDismissed(`park:${park.id}`);
                setState({ kind: "idle" });
                onOpenPark(park.id);
              }}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
            >
              Yes, open {park.name}
            </button>
            <button
              type="button"
              onClick={() => dismiss(`park:${park.id}`)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              No
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <button
        type="button"
        onClick={locate}
        disabled={state.kind === "locating"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M9.69 18.933l.003.001a.75.75 0 00.614 0l.003-.001.006-.003.02-.009a14 14 0 00.3-.147c.2-.103.48-.256.81-.46a17 17 0 002.06-1.513C15.24 15.29 17 12.9 17 9.5a7 7 0 10-14 0c0 3.4 1.76 5.79 3.49 7.3a17 17 0 002.87 1.973l.3.147.02.009.006.003zM10 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
            clipRule="evenodd"
          />
        </svg>
        {state.kind === "locating" ? "Finding you…" : "Find parks near me"}
      </button>
      {state.kind === "found" ? (
        state.nearest ? (
          <span className="text-slate-600">
            Nearest park:{" "}
            <button
              type="button"
              onClick={() => onOpenPark(state.nearest!.park.id)}
              className="font-semibold text-amber-700 underline-offset-2 hover:underline"
            >
              {state.nearest.park.name}
            </button>{" "}
            ({formatDistance(state.nearest.distanceKm)} away)
          </span>
        ) : (
          <span className="text-slate-600">No parks in the catalog within 150 km of you.</span>
        )
      ) : null}
      {state.kind === "error" ? <span className="text-rose-700">{state.message}</span> : null}
    </div>
  );
}
