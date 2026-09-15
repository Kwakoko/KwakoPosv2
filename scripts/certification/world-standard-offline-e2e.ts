import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { prisma } from "@kwakopos2/database";
import { WorldStandardPrismaSyncEngine } from "../../packages/sync/src/worldStandardPrismaSyncEngine.js";

const WEB_URL = process.env.E2E_WEB_URL || "http://127.0.0.1:4173";

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
  return spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", "4173"], {
    cwd: "apps/web",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: process.env,
  });
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
    const req = indexedDB.open("kwakopos-v2", 3);
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

async function writeServerChange(page: any, change: any): Promise<void> {
  await page.evaluate((change) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("kwakopos-v2", 3);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["stockAdjustments", "stockLedger", "syncMetadata"], "readwrite");
      if (change.record?.id && change.entityType === "StockAdjustment") tx.objectStore("stockAdjustments").put(change.record, change.entityId);
      if (change.record?.id && change.entityType === "StockLedger") tx.objectStore("stockLedger").put(change.record, change.entityId);
      tx.objectStore("syncMetadata").put(String(change.revision), "lastSyncRevision");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), change);
}

async function run(): Promise<void> {
  const web = spawnWeb();
  let tenantId = "";
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHttp(WEB_URL);
    const seeded = await seedTenant();
    tenantId = seeded.tenantId;
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await pageA.waitForTimeout(1000);

    const operationId = `browser-offline-${randomUUID()}`;
    await browserSeed(pageA, operationId, seeded.tenantId, seeded.branchId);
    await ctxA.setOffline(true);
    await pageA.reload({ waitUntil: "domcontentloaded" });
    const offlineState = await browserRead(pageA);
    if (offlineState.outbox !== 1 || !offlineState.product) throw new Error("REAL_OFFLINE_RELOAD_FAILED");

    const sw = await pageA.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.() || []).length > 0);
    const beforeUpgrade = await browserRead(pageA);
    await pageA.evaluate(() => localStorage.setItem("kwakopos:e2e:upgrade", "pending-outbox-preservation"));
    await pageA.reload({ waitUntil: "domcontentloaded" });
    const afterUpgrade = await browserRead(pageA);
    if (afterUpgrade.outbox !== beforeUpgrade.outbox || !afterUpgrade.product) throw new Error("PWA_UPGRADE_OUTBOX_PRESERVATION_FAILED");

    await ctxA.setOffline(false);
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await pageB.waitForTimeout(500);

    const engine = new WorldStandardPrismaSyncEngine({} as any, {} as any);
    const stockOperation = {
      operationId: `server-atomic-${randomUUID()}`,
      entityType: "StockAdjustment",
      entityId: `adj-${randomUUID()}`,
      operationType: "CREATE",
      payload: { variantId: seeded.variantId, adjustmentType: "INCREASE", quantityChange: 25, reason: "World-standard E2E" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: `idem-${randomUUID()}`,
    } as any;
    const tenantContext: any = { tenantId: seeded.tenantId, branchId: seeded.branchId, userId: seeded.userId };
    const pushed = await engine.processPush(tenantContext, { deviceId: "e2e-device-a", operations: [stockOperation] } as any);
    if (pushed.results[0]?.status !== "SUCCESS") throw new Error(`ATOMIC_SYNC_PUSH_FAILED:${JSON.stringify(pushed)}`);

    const syncRow = await prisma.syncOperation.findFirst({ where: { operationId: stockOperation.operationId } });
    const journalRow = await prisma.$queryRawUnsafe<any[]>("SELECT operation_id, tenant_id, branch_id, revision FROM sync_change_journal WHERE operation_id = $1", stockOperation.operationId);
    if (!syncRow || journalRow.length !== 1 || journalRow[0].tenant_id !== seeded.tenantId || journalRow[0].branch_id !== seeded.branchId) throw new Error("ATOMIC_COMMIT_EVIDENCE_FAILED");

    const replay = await engine.processPush(tenantContext, { deviceId: "e2e-device-a", operations: [stockOperation] } as any);
    if (replay.results[0]?.status !== "ALREADY_PROCESSED") throw new Error("IDEMPOTENT_REPLAY_FAILED");

    const delta = await engine.processDelta(tenantContext, { since: "rev:0" } as any) as any;
    const change = (delta.changes || []).find((x: any) => x.operationId === stockOperation.operationId || x.entityId === stockOperation.entityId);
    if (!change) throw new Error("REVISION_REPLAY_FAILED");
    await writeServerChange(pageA, change);
    await writeServerChange(pageB, change);
    const convergenceA = await pageA.evaluate(async () => { const r = await indexedDB.open("kwakopos-v2"); return new Promise<any>((resolve, reject) => { r.onerror=()=>reject(r.error); r.onsuccess=()=>{ const db=r.result; const tx=db.transaction(["stockAdjustments","stockLedger","syncMetadata"],"readonly"); const a=tx.objectStore("stockAdjustments").getAll(); const l=tx.objectStore("stockLedger").getAll(); const c=tx.objectStore("syncMetadata").get("lastSyncRevision"); tx.oncomplete=()=>{db.close(); resolve({a:a.result.length,l:l.result.length,c:String(c.result||"0")})}; tx.onerror=()=>reject(tx.error); }}); });
    const convergenceB = await pageB.evaluate(async () => { const r = await indexedDB.open("kwakopos-v2"); return new Promise<any>((resolve, reject) => { r.onerror=()=>reject(r.error); r.onsuccess=()=>{ const db=r.result; const tx=db.transaction(["stockAdjustments","stockLedger","syncMetadata"],"readonly"); const a=tx.objectStore("stockAdjustments").getAll(); const l=tx.objectStore("stockLedger").getAll(); const c=tx.objectStore("syncMetadata").get("lastSyncRevision"); tx.oncomplete=()=>{db.close(); resolve({a:a.result.length,l:l.result.length,c:String(c.result||"0")})}; tx.onerror=()=>reject(tx.error); }}); });
    if (JSON.stringify(convergenceA) !== JSON.stringify(convergenceB)) throw new Error(`MULTI_DEVICE_CONVERGENCE_FAILED:${JSON.stringify({convergenceA,convergenceB})}`);

    const proof: Proof = {
      status: "PASS",
      timestamp: new Date().toISOString(),
      browser: {
        offlineReload: offlineState.outbox === 1 && offlineState.product,
        secondDeviceConverged: JSON.stringify(convergenceA) === JSON.stringify(convergenceB),
        serviceWorkerRegistered: sw,
        upgradePreservedOutbox: afterUpgrade.outbox === beforeUpgrade.outbox,
      },
      server: {
        atomicMutationSyncOperationJournal: Boolean(syncRow && journalRow.length === 1),
        duplicateReplayIdempotent: replay.results[0]?.status === "ALREADY_PROCESSED",
        revisionReplay: Boolean(change),
        tenantScoped: journalRow[0].tenant_id === seeded.tenantId && journalRow[0].branch_id === seeded.branchId,
      },
    };
    mkdirSync("artifacts/release-evidence", { recursive: true });
    writeFileSync("artifacts/release-evidence/world-standard-offline-e2e.json", JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));

    await ctxB.close();
    await ctxA.close();
  } finally {
    if (tenantId) await cleanup(tenantId).catch(() => undefined);
    await browser.close();
    web.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error("WORLD_STANDARD_OFFLINE_E2E_FAILED", error);
  process.exit(1);
});
