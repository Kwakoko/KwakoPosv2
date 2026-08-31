import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. Web App Manifest
const manifestJson = {
  name: "KwakoPos 2.0 POS & Enterprise System",
  short_name: "KwakoPos",
  description: "Production Offline-First POS & Enterprise ERP PWA",
  start_url: "/",
  display: "standalone",
  background_color: "#0f172a",
  theme_color: "#0f172a",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
  ]
};

fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifestJson, null, 2));

// 2. Service Worker
const swJs = `// KwakoPos 2.0 Upgrade-Safe PWA Service Worker
const CACHE_NAME = "kwakopos-pwa-v2.2.0";
const ASSETS = ["/", "/index.html", "/manifest.json", "/sw.js"];

self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evt) => {
  const url = new URL(evt.request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/health" ||
    url.pathname === "/readiness" ||
    url.pathname === "/version" ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/telemetry/")
  ) {
    return;
  }

  if (evt.request.mode === "navigate") {
    evt.respondWith(
      fetch(evt.request).catch(() => caches.match("/index.html") || caches.match("/"))
    );
    return;
  }

  evt.respondWith(
    caches.match(evt.request).then((cached) => cached || fetch(evt.request))
  );
});
`;

fs.writeFileSync(path.join(distDir, 'sw.js'), swJs);

import { globalRealAppShell } from './src/realAppShell.js';

// 3. Index HTML Application Shell
const indexHtml = globalRealAppShell.generateShellHtml();

fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml);

console.log('🎉 KwakoPos Phase 30.5 Web PWA Build Completed Successfully: apps/web/dist generated with RealAppShell, manifest.json, and sw.js');
