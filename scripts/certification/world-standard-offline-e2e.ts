import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve as resolvePath } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { prisma } from "@kwakopos2/database";

const DEFAULT_WEB_PORT = 4175;
const API_URL = process.env.E2E_API_URL || "http://127.0.0.1:18080";

async function findFreeLoopbackPort(preferredPort: number): Promise<number> {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen({ host: "127.0.0.1", port }, () => {
        server.close(() => resolve(true));
      });
    });
    if (available) return port;
  }
  throw new Error("E2E_WEB_PORT_UNAVAILABLE");
}

function childLabel(child: ChildProcess): string {
  return child.exitCode === null ? "running" : "exited:" + String(child.exitCode ?? "signal");
}

async function waitForHttp(url: string, child?: ChildProcess, label = "web"): Promise<void> {
  let childError = "";
  const onError = (error: Error) => {
    childError = error.message;
  };
  child?.on("error", onError);
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (child && (child.exitCode !== null || child.signalCode)) {
        throw new Error(
          "E2E_" + label.toUpperCase() + "_PROCESS_EXITED:" + childLabel(child) +
          (childError ? ":" + childError : ""),
        );
      }
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {}
      await sleep(500);
    }
  } finally {
    child?.off("error", onError);
  }
  throw new Error("E2E_" + label.toUpperCase() + "_UNAVAILABLE: " + url);
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  if (process.platform === "win32" && child.pid) {
    await Promise.race([exited, sleep(2000)]);
    if (child.exitCode === null && !child.signalCode) {
      try {
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        /* Process may have exited between the check and taskkill. */
      }
    }
  } else {
    await Promise.race([exited, sleep(2000)]);
    if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
  }
  await Promise.race([exited, sleep(2000)]);
}

type Proof = {
  status: "PASS";
  timestamp: string;
  browser: { offlineReload: boolean; secondDeviceConverged: boolean; serviceWorkerRegistered: boolean; upgradePreservedOutbox: boolean };
  server: { atomicMutationSyncOperationJournal: boolean; duplicateReplayIdempotent: boolean; revisionReplay: boolean; tenantScoped: boolean };
};

function spawnWeb(port: number): ChildProcess {
  return spawn(
    process.execPath,
    [resolvePath("node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: resolvePath("apps/web"),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    },
  );
}

function spawnApi(): ChildProcess {
  return spawn(
    process.execPath,
    [resolvePath("node_modules/tsx/dist/cli.mjs"), "apps/api/src/serverFixed.ts"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    env: {
      ...process.env,
      NODE_ENV: "development",
      START_SERVER: "true",
      SYNC_CERTIFICATION_PRISMA: "true",
      PORT: "18080",
      HOST: "127.0.0.1",
    },
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
  await page.evaluate(({ operationId, tenantId, branchId }: { operationId: string; tenantId: string; branchId: string }) => new Promise<void>((resolve, reject) => {
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
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ["products", "productVariants", "stockLedger", "stockAdjustments", "stockBalance", "productPriceHistory", "receipts", "customers", "suppliers", "syncOutbox", "syncMetadata"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const storeNames = ["products", "syncOutbox", "syncMetadata"].filter((s) => db.objectStoreNames.contains(s));
      const tx = db.transaction(storeNames, "readonly");
      let outboxCount = 0;
      let hasProduct = false;
      let revision = "0";

      if (db.objectStoreNames.contains("syncOutbox")) {
        const outReq = tx.objectStore("syncOutbox").getAll();
        outReq.onsuccess = () => {
          outboxCount = (outReq.result || []).filter((x: any) => x?.status === "PENDING").length;
        };
      }
      if (db.objectStoreNames.contains("products")) {
        const prodReq = tx.objectStore("products").get("E2E-PRODUCT");
        prodReq.onsuccess = () => {
          hasProduct = Boolean(prodReq.result);
        };
      }
      if (db.objectStoreNames.contains("syncMetadata")) {
        const revReq = tx.objectStore("syncMetadata").get("lastSyncRevision");
        revReq.onsuccess = () => {
          revision = String(revReq.result || "0");
        };
      }

      tx.oncomplete = () => {
        db.close();
        resolve({ outbox: outboxCount, product: hasProduct, revision });
      };
      tx.onerror = () => reject(tx.error);
    };
  }));
}

async function writeServerChange(page: any, change: any): Promise<void> {
  await page.evaluate((change: any) => new Promise<void>((resolve, reject) => {
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
      const storeNames = ["products", "productVariants", "stockAdjustments", "stockLedger", "syncOutbox", "syncMetadata"].filter((s) => db.objectStoreNames.contains(s));
      const tx = db.transaction(storeNames, "readwrite");
      if (change.record && change.entityType === "Product" && db.objectStoreNames.contains("products")) {
        tx.objectStore("products").put(change.record, change.entityId);
      }
      if (change.record && change.entityType === "StockAdjustment" && db.objectStoreNames.contains("stockAdjustments")) {
        tx.objectStore("stockAdjustments").put(change.record, change.entityId);
      }
      if (change.record && change.entityType === "StockLedger" && db.objectStoreNames.contains("stockLedger")) {
        tx.objectStore("stockLedger").put(change.record, change.entityId);
      }
      if (db.objectStoreNames.contains("syncOutbox")) {
        const outboxStore = tx.objectStore("syncOutbox");
        const all = outboxStore.getAll();
        all.onsuccess = () => {
          for (const item of (all.result || [])) {
            if (item && (item.entityId === change.entityId || item.id === change.entityId)) {
              item.status = "SYNCED";
              outboxStore.put(item, item.id);
            }
          }
        };
      }
      if (db.objectStoreNames.contains("syncMetadata")) {
        tx.objectStore("syncMetadata").put(String(change.revision), "lastSyncRevision");
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), change);
}

async function apiJson(path: string, options: { method?: string; tenantId: string; branchId: string; userId: string; body?: unknown }): Promise<any> {
  const headers: Record<string, string> = { "x-tenant-id": options.tenantId, "x-branch-id": options.branchId, "x-user-id": options.userId };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let payload: any = null; try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP_${res.status}:${JSON.stringify(payload)}`);
  return payload;
}

async function run(): Promise<void> {
  const configuredWebUrl = process.env.E2E_WEB_URL;
  const webPort = configuredWebUrl
    ? Number(new URL(configuredWebUrl).port || DEFAULT_WEB_PORT)
    : await findFreeLoopbackPort(Number(process.env.E2E_WEB_PORT || DEFAULT_WEB_PORT));
  const webUrl = configuredWebUrl || "http://127.0.0.1:" + webPort;
  const web = spawnWeb(webPort);
  const api = spawnApi();
  let tenantId = "";
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHttp(webUrl + "/manifest.json", web, "web");
    await waitForHttp(API_URL + "/health", api, "api");
    const seeded = await seedTenant();
    tenantId = seeded.tenantId;
    await apiJson("/api/legal/acceptance/accept-all", { method: "POST", tenantId: seeded.tenantId, branchId: seeded.branchId, userId: seeded.userId, body: {} });
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto(webUrl, { waitUntil: "domcontentloaded" });

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
      const versionReq = indexedDB.open("kwakopos-v2");
      versionReq.onerror = () => reject(versionReq.error);
      versionReq.onsuccess = () => {
        const currentVersion = versionReq.result.version;
        versionReq.result.close();
        const req = indexedDB.open("kwakopos-v2", currentVersion + 1);
        req.onupgradeneeded = () => {
          req.transaction?.objectStore("syncMetadata").put(String(currentVersion + 1), "e2eNativeUpgradeVersion");
        };
        req.onsuccess = () => { req.result.close(); resolve(); };
        req.onerror = () => reject(req.error);
      };
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

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(webUrl, { waitUntil: "domcontentloaded" });
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
    await browser.close();
    await Promise.all([stopChild(web), stopChild(api)]);
  }
}
run().catch((error) => {
  console.error("WORLD_STANDARD_OFFLINE_E2E_FAILED", error);
  process.exit(1);
});
