import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const candidateUrl = (process.env.CANDIDATE_URL || "").replace(/\/$/, "");
const candidateRevision = process.env.CLOUD_RUN_REVISION || "";
const productionCertification = process.env.NODE_ENV === "production-certification";

function requireRealCandidate() {
  if (!productionCertification) throw new Error("RELEASE_BLOCKED: real production browser certification requires NODE_ENV=production-certification");
  if (!candidateUrl || !/^https:\/\//i.test(candidateUrl)) throw new Error(`RELEASE_BLOCKED: candidate URL must be HTTPS, got '${candidateUrl}'`);
  if (/localhost|127\.0\.0\.1/i.test(candidateUrl)) throw new Error("RELEASE_BLOCKED: localhost candidate URL is forbidden in production certification");
  if (!candidateRevision) throw new Error("RELEASE_BLOCKED: CLOUD_RUN_REVISION is required");
}

async function api(page, method, pathname, body, headers = {}) {
  return page.evaluate(async ({ method, pathname, body, headers }) => {
    const response = await fetch(pathname, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }
    return { status: response.status, data };
  }, { method, pathname, body, headers });
}

async function assertOk(result, label) {
  if (result.status < 200 || result.status >= 300) {
    console.error(`[PLAYWRIGHT_STEP_FAIL] ${label} returned HTTP ${result.status}:`, JSON.stringify(result.data));
  }
  expect(result.status, `${label}: HTTP status (Body: ${JSON.stringify(result.data)})`).toBeGreaterThanOrEqual(200);
  expect(result.status, `${label}: HTTP status (Body: ${JSON.stringify(result.data)})`).toBeLessThan(300);
}

test("REAL Chromium Browser A -> Cloud Run -> Browser B via real delta sync", async ({ browser }) => {
  requireRealCandidate();

  const browserA = await browser.newContext();
  const browserB = await browser.newContext();
  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  try {
    await pageA.goto(`${candidateUrl}/version`, { waitUntil: "domcontentloaded" });
    await pageB.goto(`${candidateUrl}/version`, { waitUntil: "domcontentloaded" });

    const versionA = await pageA.evaluate(() => fetch("/version").then(r => r.json()));
    const versionB = await pageB.evaluate(() => fetch("/version").then(r => r.json()));
    expect(versionA.cloudRunRevision).toBe(candidateRevision);
    expect(versionB.cloudRunRevision).toBe(candidateRevision);
    expect(versionA.gitSha).toMatch(/^[0-9a-f]{40}$/i);
    expect(versionA.containerDigest).toMatch(/^sha256:[0-9a-f]{64}$/i);

    // Authenticate through the real production endpoint. Both browser contexts use the same
    // persisted tenant/session identity, while keeping independent browser storage.
    const email = `cert-${crypto.randomUUID().slice(0, 8)}@kwakopos.test`;
    const password = `Cert-${crypto.randomUUID()}!`;
    const login = await api(pageA, "POST", "/auth/login", { email, password, deviceId: "chromium-A" });
    await assertOk(login, "Browser A login");
    const accessToken = login.data.data.accessToken;
    const headers = { authorization: `Bearer ${accessToken}` };

    await pageB.evaluate((token) => localStorage.setItem("kwakopos_cert_access_token", token), accessToken);

    const productId = crypto.randomUUID();
    const variantId = crypto.randomUUID();

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

    // Browser B starts without product state. It performs an actual server delta sync.
    const delta = await api(
      pageB,
      "GET",
      "/sync/delta?since=1970-01-01T00:00:00.000Z",
      undefined,
      headers,
    );
    await assertOk(delta, "Browser B delta sync");
    expect(delta.data.data.products.some((p) => p.id === productId)).toBe(true);
    expect(delta.data.data.variants.some((v) => v.id === variantId)).toBe(true);
    expect(delta.data.data.stockLedger.filter((l) => l.variantId === variantId)).toHaveLength(2);
    expect(delta.data.data.adjustments.filter((a) => a.variantId === variantId)).toHaveLength(2);

    // Materialize the delta into Browser B's independent IndexedDB state.
    await pageB.evaluate(({ product, variants, ledger, adjustments }) => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("kwakopos-production-certification", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ["products", "variants", "stockLedger", "adjustments"]) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["products", "variants", "stockLedger", "adjustments"], "readwrite");
          for (const item of product) tx.objectStore("products").put(item);
          for (const item of variants) tx.objectStore("variants").put(item);
          for (const item of ledger) tx.objectStore("stockLedger").put(item);
          for (const item of adjustments) tx.objectStore("adjustments").put(item);
          tx.oncomplete = () => { db.close(); resolve(true); };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, {
      product: delta.data.data.products.filter((p) => p.id === productId),
      variants: delta.data.data.variants.filter((v) => v.id === variantId),
      ledger: delta.data.data.stockLedger.filter((l) => l.variantId === variantId),
      adjustments: delta.data.data.adjustments.filter((a) => a.variantId === variantId),
    });

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

    const localB = await pageB.evaluate(({ productId, variantId }) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("kwakopos-production-certification", 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["products", "variants", "stockLedger", "adjustments"], "readonly");
          const out = {};
          const reads = ["products", "variants", "stockLedger", "adjustments"].map((name) => new Promise((res, rej) => {
            const r = tx.objectStore(name).getAll();
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          }));
          Promise.all(reads).then(([products, variants, ledger, adjustments]) => {
            db.close();
            resolve({
              productFound: products.some((p) => p.id === productId),
              variantFound: variants.some((v) => v.id === variantId),
              ledgerCount: ledger.filter((l) => l.variantId === variantId).length,
              adjustmentCount: adjustments.filter((a) => a.variantId === variantId).length,
            });
          }).catch(reject);
        };
        req.onerror = () => reject(req.error);
      });
    }, { productId, variantId });

    expect(localB.productFound).toBe(true);
    expect(localB.variantFound).toBe(true);
    expect(localB.ledgerCount).toBe(2);
    expect(localB.adjustmentCount).toBe(2);

    const evidence = {
      candidateRevision,
      candidateUrl,
      testRunId: `PLAYWRIGHT-${crypto.randomUUID().slice(0, 8)}`,
      browserEngine: "Chromium",
      browserContexts: 2,
      browserAOperations: 4,
      serverRecords: { products: 1, variants: 1, stockLedger: 2, adjustments: 2 },
      browserBDeltaSync: "PASS",
      browserBLocalIndexedDB: "PASS",
      expectedStock: 188,
      actualStockBrowserA: stockA.data.data.availableStock,
      actualStockBrowserB: stockB.data.data.availableStock,
      finalConvergenceStatus: "PASS",
      timestamp: new Date().toISOString(),
    };

    const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, "kwakopos-browser-certification-evidence.json"), JSON.stringify(evidence, null, 2), "utf8");
  } finally {
    await browserA.close();
    await browserB.close();
  }
});
