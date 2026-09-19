import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { loadConfig } from "../../packages/config/src/index.js";
import { globalInMemoryStore, ScopedProductRepository, ScopedStockRepository } from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("KwakoPos Production Web UI + API Routing & PWA Certification Suite", () => {
  let server: any;
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let syncEngine: SyncEngine;

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: "test", PORT: "3005" });
    server = buildServer({ config, productionPersistence: false });
    await server.ready();

    tenantCtx = {
      tenantId: "tenant-web-cert-001",
      branchId: "branch-web-cert-001",
      userId: "user-web-cert-001",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  beforeEach(() => {
    globalInMemoryStore.clear();
  });

  it("TEST 1: Open root URL GET / returns KwakoPos System UI (text/html) and NOT API JSON", async () => {
    const res = await server.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.payload).toMatch(/Kwakoko Business Operating System|KwakoPos/);
    expect(res.payload).not.toContain('"name":"KwakoPos 2.0 POS & Enterprise API Server"');
  });

  it("TEST 2: Open /login returns KwakoPos login UI shell", async () => {
    const res = await server.inject({ method: "GET", url: "/login" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.payload).toMatch(/Kwakoko Business Operating System|KwakoPos/);
  });

  it("TEST 3: Open /dashboard returns KwakoPos dashboard UI shell", async () => {
    const res = await server.inject({ method: "GET", url: "/dashboard" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.payload).toMatch(/Kwakoko Business Operating System|KwakoPos/);
  });

  it("TEST 4: Call /health returns JSON health response", async () => {
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    const json = JSON.parse(res.payload);
    expect(json.status).toBe("ok");
    expect(json.database).toBe("connected");
  });

  it("TEST 5: Navigate directly to /inventory serves SPA frontend route", async () => {
    const res = await server.inject({ method: "GET", url: "/inventory" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("TEST 6: Refresh /inventory returns identical SPA frontend route", async () => {
    const res1 = await server.inject({ method: "GET", url: "/inventory" });
    const res2 = await server.inject({ method: "GET", url: "/inventory" });
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.payload).toEqual(res2.payload);
  });

  it("TEST 7: PWA shell assets (/manifest.json & /sw.js) remain available", async () => {
    const manifestRes = await server.inject({ method: "GET", url: "/manifest.json" });
    expect(manifestRes.statusCode).toBe(200);
    expect(manifestRes.headers["content-type"]).toContain("application/json");
    const manifest = JSON.parse(manifestRes.payload);
    expect(manifest.name).toMatch(/Kwakoko Business Operating System|KwakoPos/);

    const swRes = await server.inject({ method: "GET", url: "/sw.js" });
    expect(swRes.statusCode).toBe(200);
    expect(swRes.headers["content-type"]).toContain("application/javascript");
    expect(swRes.payload).toMatch(/kwakopos-(runtime|pwa)-v2\./);
  });

  it("TEST 8 & 9: Create offline mutation into durable outbox and synchronize on reconnect", async () => {
    const browserDb = new LocalIndexedDbStore();
    const browserEngine = new ClientSyncEngine("device-browser-offline-1", browserDb);

    const productId = randomUUID();
    const now = new Date().toISOString();

    // Record offline mutation
    browserDb.recordOutboxMutation({
      id: "OP-OFFLINE-001",
      entityType: "Product",
      entityId: productId,
      operationType: "CREATE",
      payload: { name: "Offline Item", sku: "SKU-OFFLINE", category: "Retail" },
      clientCreatedAt: now,
      idempotencyKey: "DEV-OFFLINE/OP-001",
      status: "PENDING",
    });

    expect(browserDb.getPendingOutbox()).toHaveLength(1);

    // Reconnect & sync to server
    await browserEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    const serverProduct = serverProductRepo.getProductById(tenantCtx, productId);
    expect(serverProduct).not.toBeNull();
    expect(serverProduct!.name).toBe("Offline Item");
  });

  it("TEST 10: Multi-device Browser A -> API -> Browser B convergence under Web UI routing", async () => {
    const browserADb = new LocalIndexedDbStore();
    const browserAEngine = new ClientSyncEngine("device-web-A", browserADb);

    const browserBDb = new LocalIndexedDbStore();
    const browserBEngine = new ClientSyncEngine("device-web-B", browserBDb);

    const prodId = randomUUID();
    const varId = randomUUID();
    const now = new Date().toISOString();

    browserADb.saveProductLocal({
      id: prodId,
      name: "MultiDevice Tea",
      sku: "TEA-PARENT",
      category: "Beverages",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
      createdAt: now,
      updatedAt: now,
    });

    browserADb.recordOutboxMutation({
      id: "OP-WA-001",
      entityType: "Product",
      entityId: prodId,
      operationType: "CREATE",
      payload: { name: "MultiDevice Tea", sku: "TEA-PARENT", category: "Beverages" },
      clientCreatedAt: now,
      idempotencyKey: "DEV-WA/OP-001",
      status: "PENDING",
    });

    browserADb.recordOutboxMutation({
      id: "OP-WA-002",
      entityType: "ProductVariant",
      entityId: varId,
      operationType: "CREATE",
      payload: { productId: prodId, name: "250g Pack", sku: "TEA-250G", price: 2.5, costPrice: 1.5 },
      clientCreatedAt: now,
      idempotencyKey: "DEV-WA/OP-002",
      status: "PENDING",
    });

    // Browser A syncs to server
    await browserAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    // Browser B syncs delta from server
    await browserBEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    expect(browserBDb.products.size).toBe(1);
    expect(browserBDb.productVariants.size).toBe(1);
    expect(browserADb.products.size).toEqual(browserBDb.products.size);
  });
});
