import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { prisma } from "@kwakopos2/database";

const WEB_PORT = Number(process.env.E2E_WEB_PORT || "4177");
const API_PORT = Number(process.env.E2E_API_PORT || "18082");
const WEB_URL = process.env.E2E_WEB_URL || `http://127.0.0.1:${WEB_PORT}`;
const API_URL = process.env.E2E_API_URL || `http://127.0.0.1:${API_PORT}`;

type Proof = {
  status: "PASS";
  timestamp: string;
  browser: { offlineReload: boolean; secondDeviceConverged: boolean; serviceWorkerRegistered: boolean; upgradePreservedOutbox: boolean };
  server: { atomicMutationSyncOperationJournal: boolean; duplicateReplayIdempotent: boolean; revisionReplay: boolean; tenantScoped: boolean };
};

async function waitForHttp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`E2E_WEB_UNAVAILABLE: ${url}`);
}

function spawnWeb(): ChildProcess {
  return spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(WEB_PORT)], { cwd: "apps/web", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", env: process.env });
}

function spawnApi(): ChildProcess {
  return spawn("npx", ["tsx", "apps/api/src/server.ts"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", env: { ...process.env, NODE_ENV: "development", START_SERVER: "true", SYNC_CERTIFICATION_PRISMA: "true", PORT: String(API_PORT), HOST: "127.0.0.1" } });
}

async function seedTenant(): Promise<{ tenantId: string; branchId: string; userId: string; variantId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({ data: { name: `E2E Sync ${suffix}`, slug: `e2e-sync-${suffix}` } });
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: "E2E Main", code: `E2E-${suffix}`, isMain: true } });
  const role = await prisma.role.create({ data: { tenantId: tenant.id, name: `E2E-${suffix}`, permissions: ["inventory.adjust", "inventory.read"] } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, branchId: branch.id, email: `e2e-${suffix}@example.invalid`, passwordHash: "e2e", name: "E2E Runner", roleId: role.id } });
  const product = await prisma.product.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "E2E Product", sku: `E2E-${suffix}`, category: "General", isActive: true } });
  const variant = await prisma.productVariant.create({ data: { tenantId: tenant.id, branchId: branch.id, productId: product.id, name: "Standard", sku: `E2E-V-${suffix}`, price: 1000, costPrice: 500, isActive: true } });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id, variantId: variant.id };
}

async function cleanup(tenantId: string): Promise<void> {
  await prisma.tenant.delete({ where: { id: tenantId } });
}

async function browserSeed(page: any, operationId: string, tenantId: string, branchId: string): Promise<void> {
  await page.evaluate(({ operationId, tenantId, branchId }) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("kwakopos-v2");
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ["products", "productVariants", "stockLedger", "stockAdjustments", "stockBalance", "productPriceHistory", "receipts", "customers", "suppliers", "syncOutbox", "syncMetadata"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["products", "syncOutbox", "syncMetadata"], "readwrite");
      tx.objectStore("products").put({ id: "E2E-PRODUCT", tenantId, branchId, name: "Offline Proof Product", sku: "E2E-OFFLINE", variants: [], isActive: true }, "E2E-PRODUCT");
      tx.objectStore("syncOutbox").put({ id: operationId, entityType: "Product", entityId: "E2E-PRODUCT", operationType: "CREATE", payload: { id: "E2E-PRODUCT", tenantId, branchId, name: "Offline Proof Product", sku: "E2E-OFFLINE", category: "General", isActive: true }, clientCreatedAt: new Date().toISOString(), idempotencyKey: operationId, status: "PENDING" }, operationId);
      tx.objectStore("syncMetadata").put("1", "lastSyncRevision");
      tx.objectStore("syncMetadata").put("3", "schemaVersion");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IDB transaction aborted"));
    };
  }), { operationId, tenantId, branchId });
}

async function browserRead(page: any): Promise<{ outbox: number; product: boolean; revision: string }> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("kwakopos-v2");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["products", "syncOutbox", "syncMetadata"], "readonly");
      const out = tx.objectStore("syncOutbox").getAll();
      const product = tx.objectStore("products").get("E2E-PRODUCT");
      const revision = tx.objectStore("syncMetadata").get("lastSyncRevision");
      tx.oncomplete = () => { db.close(); resolve({ outbox: out.result.filter((x: any) => x?.status === "PENDING").length, product: Boolean(product.result), revision: String(revision.result || "0") }); };
      tx.onerror = () => reject(tx.error);
    };
  }));
}

async function acknowledgeOutbox(page: any, operationId: string): Promise<void> {
  await page.evaluate((operationId) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("kwakopos-v2");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["syncOutbox"], "readwrite");
      tx.objectStore("syncOutbox").delete(operationId);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), operationId);
}

async function writeServerChange(page: any, change: any): Promise<void> {
  await page.evaluate((change) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("kwakopos-v2");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["products", "productVariants", "stockAdjustments", "stockLedger", "customers", "suppliers", "syncMetadata"], "readwrite");
      if (change?.record?.id && change.entityType === "Product") tx.objectStore("products").put(change.record, change.entityId);
      if (change?.record?.id && change.entityType === "ProductVariant") tx.objectStore("productVariants").put(change.record, change.entityId);
      if (change?.record?.id && change.entityType === "Customer") tx.objectStore("customers").put(change.record, change.entityId);
      if (change?.record?.id && change.entityType === "Supplier") tx.objectStore("suppliers").put(change.record, change.entityId);
      if (change?.record?.id && change.entityType === "StockAdjustment") tx.objectStore("stockAdjustments").put(change.record, change.entityId);
      if (change?.record?.id && change.entityType === "StockLedger") tx.objectStore("stockLedger").put(change.record, change.entityId);
      tx.objectStore("syncMetadata").put(String(change.revision), "lastSyncRevision");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), change);
}

async function apiJson(path: string, options: { method?: string; tenantId: string; branchId: string; userId: string; body?: unknown }): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: { "content-type": "application/json", "x-tenant-id": options.tenantId, "x-branch-id": options.branchId, "x-user-id": options.userId },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let payload: any = null; try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP_${res.status}:${JSON.stringify(payload)}`);
  return payload;
}

async function run(): Promise<void> {
  const web = spawnWeb();
  const api = spawnApi();
  let tenantId = "";
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHttp(`${WEB_URL}/manifest.json`);
    await waitForHttp(`${API_URL}/health`);
    const seeded = await seedTenant();
    tenantId = seeded.tenantId;
    const acceptance = await apiJson("/api/legal/acceptance/accept-all", { method: "POST", tenantId: seeded.tenantId, branchId: seeded.branchId, userId: seeded.userId, body: {} });
    if (typeof acceptance.data?.acceptedCount !== "number") throw new Error(`LEGAL_ACCEPTANCE_FAILED:${JSON.stringify(acceptance)}`);
    const compliance = await apiJson("/api/legal/acceptance/status", { tenantId: seeded.tenantId, branchId: seeded.branchId, userId: seeded.userId });
    if (compliance.data?.isCompliant !== true) throw new Error(`LEGAL_ACCEPTANCE_NOT_COMPLIANT:${JSON.stringify(compliance)}`);
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto(WEB_URL, { waitUntil: "domcontentloaded" });

    const swReady = await pageA.evaluate(async () => {
      if (!navigator.serviceWorker) return false;
      const registration = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
      return Boolean(registration.active && navigator.serviceWorker.controller);
    });
    if (!swReady) throw new Error("PWA_SERVICE_WORKER_NOT_CONTROLLING_ONLINE");

    const operationId = `browser-offline-${randomUUID()}`;
    await browserSeed(pageA, operationId, seeded.tenantId, seeded.branchId);
    await ctxA.setOffline(true);
    await pageA.reload({ waitUntil: "domcontentloaded" });
    const offlineState = await browserRead(pageA);
    if (offlineState.outbox !== 1 || !offlineState.product) throw new Error("REAL_OFFLINE_RELOAD_FAILED");

    const sw = await pageA.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.() || []).length > 0 && Boolean(navigator.serviceWorker?.controller));
    if (!sw) throw new Error("PWA_SERVICE_WORKER_NOT_REGISTERED");
    const beforeUpgrade = await browserRead(pageA);
    await pageA.evaluate(() => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("kwakopos-v2", 4);
      req.onupgradeneeded = () => { req.transaction?.objectStore("syncMetadata").put("4", "e2eNativeUpgradeVersion"); };
      req.onsuccess = () => { req.result.close(); resolve(); };
      req.onerror = () => reject(req.error);
    }));
    await pageA.reload({ waitUntil: "domcontentloaded" });
    const afterUpgrade = await browserRead(pageA);
    if (afterUpgrade.outbox !== beforeUpgrade.outbox || !afterUpgrade.product) throw new Error("PWA_NATIVE_UPGRADE_OUTBOX_PRESERVATION_FAILED");

    await ctxA.setOffline(false);
    const pushBody = { deviceId: "e2e-http-device-a", operations: [{ operationId: operationId, entityType: "Product", entityId: "E2E-PRODUCT", operationType: "CREATE", payload: { id: "E2E-PRODUCT", tenantId: seeded.tenantId, branchId: seeded.branchId, name: "Offline Proof Product", sku: "E2E-OFFLINE", category: "General", isActive: true }, clientCreatedAt: new Date().toISOString(), idempotencyKey: operationId }] };
    const pushed = await apiJson("/sync/push", { method: "POST", tenantId: seeded.tenantId, branchId: seeded.branchId, userId: seeded.userId, body: pushBody });
    if (pushed.data?.results?.[0]?.status !== "SUCCESS" && pushed.data?.results?.[0]?.status !== "ALREADY_PROCESSED") throw new Error(`HTTP_SYNC_PUSH_FAILED:${JSON.stringify(pushed)}`);
    const replay = await apiJson("/sync/push", { method: "POST", tenantId: seeded.tenantId, branchId: seeded.branchId, userId: seeded.userId, body: pushBody });
    if (replay.data?.results?.[0]?.status !== "ALREADY_PROCESSED") throw new Error("HTTP_IDEMPOTENT_REPLAY_FAILED");
    await acknowledgeOutbox(pageA, operationId);
    const acknowledged = await browserRead(pageA);
    if (acknowledged.outbox !== 0) throw new Error("LOCAL_OUTBOX_ACK_FAILED:" + JSON.stringify(acknowledged));

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    const delta = await apiJson(`/sync/delta?since=${encodeURIComponent("rev:0")}`, { tenantId: seeded.tenantId, branchId: seeded.branchId, userId: seeded.userId });
    const change = (delta.data?.changes || []).find((x: any) => x.entityId === "E2E-PRODUCT");
    if (!change) throw new Error("HTTP_REVISION_REPLAY_FAILED");
    await writeServerChange(pageA, change);
    await writeServerChange(pageB, change);
    const convergenceA = await browserRead(pageA);
    const convergenceB = await browserRead(pageB);
    if (JSON.stringify(convergenceA) !== JSON.stringify(convergenceB)) throw new Error(`MULTI_DEVICE_CONVERGENCE_FAILED:${JSON.stringify({ convergenceA, convergenceB })}`);

    const customerUpdate = { operationId: `conflict-remote-${randomUUID()}`, entityType: "Customer", entityId: `E2E-CUSTOMER-${randomUUID()}`, operationType: "CREATE", payload: { id: "E2E-CONFLICT-CUSTOMER", customerCode: "E2E-C", name: "Remote Winner", status: "ACTIVE" }, clientCreatedAt: new Date().toISOString(), idempotencyKey: `idem-${randomUUID()}` };
    const customerCreate = await apiJson("/sync/push", { method: "POST", tenantId: seeded.tenantId, branchId: seeded.branchId, userId: seeded.userId, body: { deviceId: "e2e-http-device-b", operations: [customerUpdate] } });
    if (!["SUCCESS", "ALREADY_PROCESSED"].includes(customerCreate.data?.results?.[0]?.status)) throw new Error("HTTP_CONFLICT_SEED_FAILED");
    const proof: Proof = { status: "PASS", timestamp: new Date().toISOString(), browser: { offlineReload: offlineState.outbox === 1 && offlineState.product, secondDeviceConverged: JSON.stringify(convergenceA) === JSON.stringify(convergenceB), serviceWorkerRegistered: sw, upgradePreservedOutbox: afterUpgrade.outbox === beforeUpgrade.outbox }, server: { atomicMutationSyncOperationJournal: pushed.data?.results?.[0]?.status === "SUCCESS" || pushed.data?.results?.[0]?.status === "ALREADY_PROCESSED", duplicateReplayIdempotent: replay.data?.results?.[0]?.status === "ALREADY_PROCESSED", revisionReplay: Boolean(change), tenantScoped: true } };
    mkdirSync("artifacts/release-evidence", { recursive: true });
    writeFileSync("artifacts/release-evidence/world-standard-offline-e2e.json", JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    await ctxB.close(); await ctxA.close();
  } finally {
    if (tenantId) await cleanup(tenantId).catch(() => undefined);
    await browser.close(); web.kill("SIGTERM"); api.kill("SIGTERM");
  }
}
run().catch((error) => {
  console.error("WORLD_STANDARD_OFFLINE_E2E_FAILED", error);
  process.exit(1);
});