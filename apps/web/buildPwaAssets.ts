import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(dir, "public");
fs.mkdirSync(publicDir, { recursive: true });

const packageJson = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
const version = String(packageJson.version || "0.0.0");
const cacheName = `kwakopos-runtime-v${version}`;

fs.writeFileSync(path.join(publicDir, "manifest.json"), JSON.stringify({
  name: "KwakoPos 2.0 POS & Enterprise System",
  short_name: "KwakoPos",
  description: "Production Offline-First POS & Enterprise Business Operating System",
  start_url: "/",
  display: "standalone",
  background_color: "#0f172a",
  theme_color: "#0f172a",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
  ]
}, null, 2));

fs.writeFileSync(path.join(publicDir, "sw.js"), `const CACHE_NAME = ${JSON.stringify(cacheName)};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(["/", "/manifest.json"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/telemetry/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put("/", clone));
      return response;
    }).catch(() => caches.match("/")));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && request.method === "GET") {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
    }
    return response;
  })));
});
`);

console.log(`KwakoPos V2 PWA assets prepared for version ${version}; cache=${cacheName}; Vite owns the React application build.`);
