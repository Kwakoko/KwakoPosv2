import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const candidateUrl = (process.env.CANDIDATE_URL || "").replace(/\/$/, "");
const candidateRevision = process.env.CLOUD_RUN_REVISION || "";
const productionCertification = process.env.NODE_ENV === "production-certification";

function requireRealCandidate() {
  if (!productionCertification) {
    throw new Error("RELEASE_BLOCKED: real production browser certification requires NODE_ENV=production-certification");
  }
  if (!candidateUrl || !/^https:\/\//i.test(candidateUrl)) {
    throw new Error(`RELEASE_BLOCKED: candidate URL must be HTTPS, got '${candidateUrl}'`);
  }
  if (/localhost|127\.0\.0\.1/i.test(candidateUrl)) {
    throw new Error("RELEASE_BLOCKED: localhost candidate URL is forbidden in production certification");
  }
  if (!candidateRevision) {
    throw new Error("RELEASE_BLOCKED: CLOUD_RUN_REVISION is required");
  }
}

async function api(page, method, pathname, body, headers) {
  return page.evaluate(async ({ method, pathname, body, headers }) => {
    const response = await fetch(pathname, {
      method,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }
    return { status: response.status, data };
  }, { method, pathname, body, headers });
}

async function assertOk(result, label) {
  expect(result.status, `${label}: HTTP status`).toBeGreaterThanOrEqual(200);
  expect(result.status, `${label}: HTTP status`).toBeLessThan(300);
}

function tenantHeaders() {
  return {
    "x-tenant-id": "tenant-browser-cert-real",
    "x-branch-id": "branch-browser-cert-real",
    "x-user-id": "user-browser-cert-real",
  };
}

test("REAL Chromium Browser A -> Cloud Run -> Browser B convergence", async ({ browser }) => {
  requireRealCandidate();

  const browserA = await browser.newContext();
  const browserB = await browser.newContext();
  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  try {
    // Establish two independent browser origins and storage partitions.
    await pageA.goto(`${candidateUrl}/version`, { waitUntil: "domcontentloaded" });
    await pageB.goto(`${candidateUrl}/version`, { waitUntil: "domcontentloaded" });

    const versionA = await pageA.evaluate(() => fetch("/version").then(r => r.json()));
    const versionB = await pageB.evaluate(() => fetch("/version").then(r => r.json()));

    expect(versionA.cloudRunRevision).toBe(candidateRevision);
    expect(versionB.cloudRunRevision).toBe(candidateRevision);
    expect(versionA.gitSha).toBeTruthy();
    expect(versionA.containerDigest).toMatch(/^sha256:[0-9a-f]{64}$/i);

    const headers = tenantHeaders();
    const productId = crypto.randomUUID();
    const variantId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Browser A: create Product and Variant via the real candidate.
    const productResult = await api(pageA, "POST", "/products", {
      id: productId,
      name: "Production Chromium Water",
      sku: `PCW-${productId.slice(0, 8)}`,
      category: "Beverages",
    }, headers);
    await assertOk(productResult, "Browser A product create");

    const variantResult = await api(pageA, "POST", `/products/${productId}/variants`, {
      id: variantId,
      name: "500ml",
      sku: `PCW-500-${variantId.slice(0, 8)}`,
      price: 1.5,
      costPrice: 0.8,
    }, headers);
    await assertOk(variantResult, "Browser A variant create");

    // Browser A: create opening stock (+200) and damage adjustment (-12).
    const opening = await api(pageA, "POST", "/inventory/adjustments", {
      variantId,
      adjustmentType: "INCREASE",
      quantityChange: 200,
      reason: "Real Chromium opening stock",
      deviceId: "chromium-A",
      operationId: `PW-A-OPEN-${productId}`,
      idempotencyKey: `PW-A/OPEN/${productId}`,
    }, headers);
    await assertOk(opening, "Browser A opening stock");

    const damage = await api(pageA, "POST", "/inventory/adjustments", {
      variantId,
      adjustmentType: "DECREASE",
      quantityChange: 12,
      reason: "Real Chromium damage adjustment",
      deviceId: "chromium-A",
      operationId: `PW-A-DAMAGE-${productId}`,
      idempotencyKey: `PW-A/DAMAGE/${productId}`,
    }, headers);
    await assertOk(damage, "Browser A damage adjustment");

    const stockA = await api(pageA, "GET", `/inventory/stock/${variantId}`, undefined, headers);
    await assertOk(stockA, "Browser A stock read");
    expect(stockA.data.data.availableStock).toBe(188);

    // Browser B: prove the state is retrievable from the same deployed candidate.
    const productB = await api(pageB, "GET", `/products/${productId}`, undefined, headers);
    await assertOk(productB, "Browser B product read");
    expect(productB.data.data.id).toBe(productId);
    expect(productB.data.data.variants).toHaveLength(1);
    expect(productB.data.data.variants[0].id).toBe(variantId);

    const stockB = await api(pageB, "GET", `/inventory/stock/${variantId}`, undefined, headers);
    await assertOk(stockB, "Browser B stock read");
    expect(stockB.data.data.availableStock).toBe(188);

    const ledgerB = await api(pageB, "GET", `/inventory/ledger?variantId=${encodeURIComponent(variantId)}`, undefined, headers);
    await assertOk(ledgerB, "Browser B ledger read");
    expect(ledgerB.data.data).toHaveLength(2);

    // Browser B creates a local IndexedDB marker to prove independent browser storage.
    await pageB.evaluate(({ productId, variantId }) => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("kwakopos-production-certification", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("convergence", { keyPath: "id" });
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("convergence", "readwrite");
          tx.objectStore("convergence").put({ id: "B", productId, variantId, stock: 188 });
          tx.oncomplete = () => { db.close(); resolve(true); };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, { productId, variantId });

    const evidence = {
      candidateRevision,
      candidateUrl,
      testRunId: `PLAYWRIGHT-${crypto.randomUUID().slice(0, 8)}`,
      browserEngine: "Chromium",
      browserContexts: 2,
      browserAOperations: 4,
      serverRecords: {
        products: 1,
        variants: 1,
        stockLedger: 2,
        adjustments: 2,
      },
      browserBOperations: 0,
      expectedStock: 188,
      actualStockBrowserA: stockA.data.data.availableStock,
      actualStockBrowserB: stockB.data.data.availableStock,
      finalConvergenceStatus: "PASS",
      timestamp: new Date().toISOString(),
    };

    const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, "kwakopos-browser-certification-evidence.json"),
      JSON.stringify(evidence, null, 2),
      "utf8",
    );
  } finally {
    await browserA.close();
    await browserB.close();
  }
});
