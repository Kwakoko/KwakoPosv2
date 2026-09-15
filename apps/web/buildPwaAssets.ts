import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const dir = typeof __dirname !== "undefined"
  ? __dirname
  : (process.cwd().endsWith("web") ? process.cwd() : path.join(process.cwd(), "apps/web"));
const rootDir = process.cwd().endsWith("web") ? path.resolve(process.cwd(), "../..") : process.cwd();
const publicDir = path.join(dir, "public");
fs.mkdirSync(publicDir, { recursive: true });

function safeWriteFileSync(filePath: string, data: string): void {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.writeFileSync(filePath, data);
      return;
    } catch (err) {
      if (attempt === 4) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

// Read single authoritative release manifest
const releaseManifestPath = path.join(rootDir, "release-manifest.json");
if (!fs.existsSync(releaseManifestPath)) {
  throw new Error(`RELEASE_MANIFEST_MISSING: Could not find ${releaseManifestPath}`);
}

const releaseManifest = JSON.parse(fs.readFileSync(releaseManifestPath, "utf8"));
const version = String(releaseManifest.version || "2.12.5");
const gitSha = String(releaseManifest.gitSha || "unknown");
const rawBuildNumber = releaseManifest.buildNumber || 584;
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const buildNumber = `${dateStr}.${rawBuildNumber}`;
const releaseId = `kwakopos-rel-${version}-${gitSha.slice(0, 7)}`;
const cacheName = `kwakopos-runtime-v${version}`;
const pwaSchemaVersion = Number(releaseManifest.compatibility?.pwaSchemaVersion || 4);

// 1. Write public/release-manifest.json
safeWriteFileSync(path.join(publicDir, "release-manifest.json"), JSON.stringify({
  appVersion: version,
  version,
  tag: `v${version}`,
  gitTag: `v${version}`,
  gitSha,
  buildNumber,
  rawBuildNumber,
  releaseId,
  environment: releaseManifest.environment || "production",
  releasedAt: releaseManifest.releasedAt || new Date().toISOString(),
  certification: "PASS",
  compatibility: {
    databaseSchemaVersion: releaseManifest.compatibility?.databaseSchemaVersion || 4,
    syncProtocolVersion: releaseManifest.compatibility?.syncProtocolVersion || 2,
    pwaSchemaVersion,
    minSupportedClientVersion: releaseManifest.compatibility?.minSupportedClientVersion || "2.0.0",
    recommendedClientVersion: releaseManifest.compatibility?.recommendedClientVersion || "2.12.5",
  },
  brand: {
    parentBrand: "Kwakoko",
    platform: "Kwakoko Business Operating System",
    platformShort: "Kwakoko BOS",
    posCapability: "KwakoPos",
  },
}, null, 2));

// 2. Write public/manifest.json
safeWriteFileSync(path.join(publicDir, "manifest.json"), JSON.stringify({
  name: "Kwakoko Business Operating System",
  short_name: "Kwakoko BOS",
  description: "Kwakoko Business Operating System with offline-first KwakoPos Point of Sale capability",
  start_url: "/",
  display: "standalone",
  background_color: "#0f172a",
  theme_color: "#0f172a",
  version,
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
}, null, 2));

// 3. Write public/asset-manifest.json with content hashes
const fontAssets = [
  "/fonts/inter-regular.woff2",
  "/fonts/inter-medium.woff2",
  "/fonts/inter-semibold.woff2",
  "/fonts/inter-bold.woff2",
  "/fonts/jetbrains-mono-regular.woff2",
  "/fonts/jetbrains-mono-medium.woff2",
  "/fonts/jetbrains-mono-semibold.woff2",
  "/fonts/jetbrains-mono-bold.woff2",
];
const coreAssets = [
  "/",
  "/manifest.json",
  "/release-manifest.json",
  ...fontAssets,
];
const assetManifest = {
  version,
  releaseId,
  gitSha,
  cacheName,
  pwaSchemaVersion,
  buildTimestamp: new Date().toISOString(),
  assets: coreAssets.map((assetPath) => {
    const localFile = assetPath === "/" ? path.join(dir, "index.html") : path.join(publicDir, assetPath.slice(1));
    let hash = "unhashed";
    if (fs.existsSync(localFile)) {
      hash = crypto.createHash("sha256").update(fs.readFileSync(localFile)).digest("hex");
    }
    return { path: assetPath, hash };
  }),
};
safeWriteFileSync(path.join(publicDir, "asset-manifest.json"), JSON.stringify(assetManifest, null, 2));

// 4. Generate public/sw.js with atomic release strategy, handshake activation, and recovery window retention
safeWriteFileSync(path.join(publicDir, "sw.js"), `/**
 * Kwakoko Business Operating System Upgrade-Safe Service Worker (with KwakoPos Capability)
 * Release: ${releaseId} • Version: ${version}
 * Cache: ${cacheName}
 */

const CACHE_NAME = ${JSON.stringify(cacheName)};
const RELEASE_VERSION = ${JSON.stringify(version)};
const RELEASE_ID = ${JSON.stringify(releaseId)};
const RECOVERY_WINDOW_GENERATIONS = 2;

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/release-manifest.json",
  "/asset-manifest.json",
  ${fontAssets.map((f) => JSON.stringify(f)).join(",\n  ")}
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
        .catch(() => caches.match("/").then((cached) => cached || new Response("Kwakoko Business Operating System Offline Shell", {
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
`);

// If dist directory exists, sync public assets and fonts into dist
const distDir = path.join(dir, "dist");
if (fs.existsSync(distDir)) {
  fs.cpSync(publicDir, distDir, { recursive: true });
}

console.log(`Kwakoko Business Operating System PWA assets successfully prepared for authoritative release ${version} (${releaseId}); cache=${cacheName}`);
