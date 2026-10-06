"use client";

import { useEffect, useMemo, useState } from "react";

const DISMISS_KEY = "ct_a2hs_dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isIosChrome(): boolean {
  return isIosDevice() && /CriOS/.test(navigator.userAgent);
}

function isIosSafari(): boolean {
  if (!isIosDevice()) return false;
  const ua = navigator.userAgent;
  // Safari on iOS (not Chrome/Firefox/Edge wrappers).
  return /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(mq || iosStandalone);
}

/**
 * Tip for installing CoasterTrak on the home screen.
 * Android/Desktop Chrome: beforeinstallprompt when available.
 * iOS Safari: Share → Add to Home Screen.
 * iOS Chrome: must use Safari (Apple restriction).
 */
export function AddToHomeScreenTip({ className = "" }: { className?: string }) {
  const [dismissed, setDismissed] = useState(true);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);

  const iosSafari = useMemo(() => isIosSafari(), []);
  const iosChrome = useMemo(() => isIosChrome(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneDisplay()) {
      setDismissed(true);
      return;
    }
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {
      // ignore
    }
    setDismissed(false);

    const onBip = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      dismiss();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={[
        "rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Add CoasterTrak to your home screen</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Opens like an app from your home screen — starts on the CoasterTrak home page, then jump to Discover,
            Stats, or Friends from the menu.
          </p>
          {iosChrome ? (
            <p className="mt-3 text-sm text-slate-700">
              On iPhone, home-screen apps only work from{" "}
              <span className="font-semibold">Safari</span> (Apple’s rule — Chrome can’t install them).
              Open <span className="font-semibold">coastertrak.com</span> in Safari, then Share → Add to Home
              Screen.
            </p>
          ) : iosSafari ? (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>
                Tap the <span className="font-semibold">Share</span> button in Safari
              </li>
              <li>
                Choose <span className="font-semibold">Add to Home Screen</span>
              </li>
              <li>
                Tap <span className="font-semibold">Add</span>
              </li>
            </ol>
          ) : deferred ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void install()}
              className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {busy ? "Opening…" : "Install app"}
            </button>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              In Chrome’s menu (⋮), look for <span className="font-semibold">Install app</span> or{" "}
              <span className="font-semibold">Add to Home screen</span>. Use the live site over HTTPS (not a
              random preview URL), and stay on the page for a few seconds after tapping once.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800"
          aria-label="Dismiss add to home screen tip"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
