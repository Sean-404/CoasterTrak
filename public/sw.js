/* Minimal service worker so Chromium can fire beforeinstallprompt / Install app. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Required by Chrome's beforeinstallprompt heuristics — pass-through network. */
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
