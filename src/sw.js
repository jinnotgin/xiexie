// Service worker: makes the app installable and usable offline.
// Built into dist/sw.js by the "service-worker" plugin in vite.config.ts, which prepends
// VERSION (changes whenever the built files change) and PRECACHE (every built file).
/* global VERSION, PRECACHE */

const APP = "xiexie-app-" + VERSION;
const FONTS = "xiexie-fonts";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

// Drop caches from older builds, so old hashed bundles don't pile up.
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("xiexie-app-") && k !== APP).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages: network first so a new deploy shows up straight away, cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => { if (res.ok) caches.open(APP).then(c => c.put("./", res.clone())); return res; })
        .catch(() => caches.match("./", { cacheName: APP })),
    );
    return;
  }

  // Google Fonts: serve the cached copy, refresh it in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const fresh = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; });
      return hit || fresh;
    }));
    return;
  }

  // Our own files (hashed bundles, stroke data, icons): cache first. Everything else (Firebase etc.) goes straight to the network.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { cacheName: APP }).then(hit => hit || fetch(req)));
  }
});
