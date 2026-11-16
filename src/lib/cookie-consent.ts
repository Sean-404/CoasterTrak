/**
 * The visitor's cookie choice. Sign-in sessions and saved preferences are essential and always
 * on; "accepted" additionally allows advertising cookies (the AdSense script is only loaded
 * after it). Stored in localStorage so the choice is remembered on this device.
 */
export type CookieConsent = "accepted" | "essential";

export const COOKIE_CONSENT_KEY = "ct_cookie_consent";
const CHANGE_EVENT = "ct:cookie-consent";
const OPEN_EVENT = "ct:cookie-consent-open";

export function parseCookieConsent(value: string | null | undefined): CookieConsent | null {
  return value === "accepted" || value === "essential" ? value : null;
}

/** The saved choice, or null when the visitor has not chosen yet (or storage is blocked). */
export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    return parseCookieConsent(window.localStorage.getItem(COOKIE_CONSENT_KEY));
  } catch {
    return null;
  }
}

export function saveCookieConsent(choice: CookieConsent): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this page view via the event below.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: choice }));
}

/** For useSyncExternalStore: re-read when the choice changes here or in another tab. */
export function subscribeCookieConsent(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Reopen the prompt so a visitor can change their mind (footer "Cookie settings"). */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function subscribeCookieSettingsOpen(onOpen: () => void): () => void {
  window.addEventListener(OPEN_EVENT, onOpen);
  return () => window.removeEventListener(OPEN_EVENT, onOpen);
}
