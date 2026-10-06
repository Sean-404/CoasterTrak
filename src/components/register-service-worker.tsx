"use client";

import { useEffect } from "react";

/** Registers the installability service worker (Chromium Install / beforeinstallprompt). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Only register on secure contexts (https / localhost).
    if (!window.isSecureContext) return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore — install tip still shows manual instructions.
    });
  }, []);

  return null;
}
