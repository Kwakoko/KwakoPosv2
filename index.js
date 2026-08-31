// Root Entrypoint for GCP Cloud Run / Firebase App Hosting Buildpack
import fs from "fs";
import { pathToFileURL } from "url";

const candidatePaths = [
  "apps/api/dist/serverFixed.js",
  "apps/api/dist/server.js",
  "apps/api/dist/src/serverFixed.js",
  "apps/api/dist/src/server.js",
  "apps/api/dist/apps/api/src/serverFixed.js",
  "apps/api/dist/apps/api/src/server.js",
  "./apps/api/dist/serverFixed.js",
  "./apps/api/dist/server.js",
  "./apps/api/dist/src/serverFixed.js",
  "./apps/api/dist/src/server.js",
  "./apps/api/dist/apps/api/src/serverFixed.js",
  "./apps/api/dist/apps/api/src/server.js",
];

const foundPath = candidatePaths.find((p) => fs.existsSync(p));

if (foundPath) {
  console.log(`Starting KwakoPos 2.0 API from entrypoint: ${foundPath}`);
  await import(pathToFileURL(foundPath).href);
} else {
  console.error("CRITICAL: No compiled API server entrypoint found in dist candidates:", candidatePaths);
  process.exit(1);
}
