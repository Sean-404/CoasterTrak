"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  type CookieConsent,
  openCookieSettings,
  readCookieConsent,
  saveCookieConsent,
  subscribeCookieConsent,
  subscribeCookieSettingsOpen,
} from "@/lib/cookie-consent";

/** The saved choice; `undefined` on the server and during hydration, before storage is read. */
export function useCookieConsent(): CookieConsent | null | undefined {
  return useSyncExternalStore(subscribeCookieConsent, readCookieConsent, () => undefined);
}

/** Bottom-of-screen prompt shown until the visitor picks, and again from "Cookie settings". */
export function CookieConsentPrompt() {
  const consent = useCookieConsent();
  const [reopened, setReopened] = useState(false);

  useEffect(() => subscribeCookieSettingsOpen(() => setReopened(true)), []);

  // undefined: not hydrated yet, so nothing is rendered and the server HTML matches.
  if (consent === undefined || (consent !== null && !reopened)) return null;

  const choose = (choice: CookieConsent) => {
    saveCookieConsent(choice);
    setReopened(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          CoasterTrak uses cookies and local storage to keep you signed in and remember your settings. With
          your permission, our advertising partners also use cookies to show and measure ads.{" "}
          <Link href="/privacy" className="font-semibold text-amber-700 underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

/** Footer link that reopens the prompt. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      Cookie settings
    </button>
  );
}
