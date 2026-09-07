/**
 * KwakoPos Enterprise PWA Upgrade-Safe Service Worker
 * Release: kwakopos-rel-2.12.5-1eed41e • Version: 2.12.5
 * Cache: kwakopos-runtime-v2.12.5
 */

const CACHE_NAME = "kwakopos-runtime-v2.12.5";
const RELEASE_VERSION = "2.12.5";
const RELEASE_ID = "kwakopos-rel-2.12.5-1eed41e";
const RECOVERY_WINDOW_GENERATIONS = 2;

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/release-manifest.json",
  "/asset-manifest.json"
];

// Staged install: pre-cache immutable assets into new generation without premature skipWaiting
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Pre-cache warning:", err);
      });
    })
  );
});

// Controlled activation: retains previous generation during recovery window
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const runtimeCaches = keys.filter((k) => k.startsWith("kwakopos-runtime-v"));
      // Retain the current cache and the most recent previous generation
      const sortedCaches = runtimeCaches.sort().reverse();
      const toRetain = new Set(sortedCaches.slice(0, RECOVERY_WINDOW_GENERATIONS));
      toRetain.add(CACHE_NAME);

      return Promise.all(
        keys.map((key) => {
          if (!toRetain.has(key)) {
            console.info("[SW] Pruning obsolete cache generation:", key);
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Message Handshake: controlled activation and cache management
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "KWAKOPOS_ACTIVATE_RELEASE") {
    console.info("[SW] Controlled activation handshake received; activating release:", RELEASE_ID);
    self.skipWaiting();
  }

  if (data.type === "KWAKOPOS_PURGE_OBSOLETE_CACHES") {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key !== CACHE_NAME && key.startsWith("kwakopos-runtime-v")) {
          caches.delete(key);
        }
      });
    });
  }

  if (data.type === "KWAKOPOS_QUERY_VERSION" && event.source) {
    event.source.postMessage({
      type: "KWAKOPOS_VERSION_INFO",
      version: RELEASE_VERSION,
      releaseId: RELEASE_ID,
      cacheName: CACHE_NAME
    });
  }
});

// Resilient Fetch Event Handler
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Exempt API, Auth, Telemetry, and non-GET requests
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/telemetry/") ||
    request.method !== "GET"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", clone));
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || new Response("KwakoPos Offline Shell", {
          status: 200,
          headers: { "Content-Type": "text/html" }
        })))
    );
    return;
  }

  // Cache-first for versioned immutable assets, network-first for manifests
  if (url.pathname.endsWith(".json") || url.pathname.endsWith("manifest.json")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
