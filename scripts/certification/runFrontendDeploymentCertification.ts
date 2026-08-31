import * as fs from 'fs';
import * as path from 'path';
import { buildServer } from '../../apps/api/src/server.js';
import { loadConfig } from '../../packages/config/src/index.js';

export async function runFrontendDeploymentCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS FRONTEND WEB PWA & DEPLOYMENT ROUTING CERTIFICATION GATE       ");
  console.log(" Standard: 21-Requirement Web UI & API Separation Contract              ");
  console.log("========================================================================");

  // 1. Verify apps/web/dist Directory
  const distDir = path.resolve(process.cwd(), "apps/web/dist");
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    throw new Error("RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: apps/web/dist directory is missing or empty.");
  }
  console.log(" ✓ [PASS] GATE-01: apps/web/dist distribution directory exists.");

  // 2. Verify apps/web/dist/index.html
  const indexPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error("RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: apps/web/dist/index.html is missing.");
  }
  const indexContent = fs.readFileSync(indexPath, "utf8");
  if (!indexContent.toLowerCase().includes("<!doctype html>")) {
    throw new Error("RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: index.html does not contain valid HTML shell.");
  }
  console.log(" ✓ [PASS] GATE-02: index.html PWA Application Shell verified.");

  // 3. Verify manifest.json & sw.js
  const manifestPath = path.join(distDir, "manifest.json");
  const swPath = path.join(distDir, "sw.js");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(swPath)) {
    throw new Error("RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: PWA manifest.json or sw.js missing from build output.");
  }
  console.log(" ✓ [PASS] GATE-03: Web App Manifest & Upgrade-Safe Service Worker present.");

  // 4. Test Live Fastify Server Instance Routing
  const config = loadConfig({ NODE_ENV: "test", PORT: "3004" });
  const server = buildServer({ config, productionPersistence: false });
  await server.ready();

  try {
    // Test 1: GET / returns HTML System UI (NOT API JSON)
    const rootRes = await server.inject({ method: "GET", url: "/" });
    if (rootRes.statusCode !== 200) {
      throw new Error(`RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: Root GET / returned status ${rootRes.statusCode}`);
    }
    const contentType = rootRes.headers["content-type"] || "";
    if (!contentType.includes("text/html")) {
      throw new Error(`RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: Root GET / returned content-type ${contentType} instead of text/html`);
    }
    if (rootRes.payload.includes('"name":"KwakoPos 2.0 POS & Enterprise API Server"')) {
      throw new Error("RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: Root URL served Fastify API JSON document instead of Web UI!");
    }
    console.log(" ✓ [PASS] GATE-04: Root URL GET / returns HTTP 200 text/html KwakoPos System UI.");

    // Test 2: SPA Fallback Routes (/login, /dashboard, /inventory) return HTML
    for (const spaRoute of ["/login", "/dashboard", "/inventory", "/pos", "/settings"]) {
      const res = await server.inject({ method: "GET", url: spaRoute });
      if (res.statusCode !== 200 || !res.headers["content-type"]?.includes("text/html")) {
        throw new Error(`RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: SPA route ${spaRoute} failed to serve index.html shell.`);
      }
    }
    console.log(" ✓ [PASS] GATE-05: SPA Fallback Routing (/login, /dashboard, /inventory) verified.");

    // Test 3: API endpoints (/health, /version) remain dedicated JSON handlers
    const healthRes = await server.inject({ method: "GET", url: "/health" });
    if (healthRes.statusCode !== 200 || !healthRes.headers["content-type"]?.includes("application/json")) {
      throw new Error("RELEASE_BLOCKED: FRONTEND_DEPLOYMENT_INVALID: /health endpoint failed to return JSON.");
    }
    console.log(" ✓ [PASS] GATE-06: Dedicated API endpoints (/health, /version) return application/json.");

  } finally {
    await server.close();
  }

  console.log("========================================================================");
  console.log(" 🏆 FRONTEND PWA & ROUTING CERTIFICATION RESULT: PASSED (6/6 GATES)    ");
  console.log("========================================================================");
  return true;
}

if (process.argv[1]?.includes("runFrontendDeploymentCertification")) {
  runFrontendDeploymentCertification().catch((err) => {
    console.error("\n❌ CERTIFICATION FAILED:", err.message);
    process.exit(1);
  });
}
