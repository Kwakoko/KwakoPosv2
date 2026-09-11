import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  ScopedCommercialRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import type { TenantContext } from "@kwakopos2/contracts";
import { calculateAvailableStock } from "@kwakopos2/domain";
import { randomUUID } from "crypto";

describe("KwakoPos v2 — Comprehensive Convergence Lifecycle Test Suite", () => {
  let tenantA: TenantContext;
  let tenantB: TenantContext;
  let branchA2: TenantContext;

  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let serverCommercialRepo: ScopedCommercialRepository;
  let syncEngine: SyncEngine;

  let deviceADb: LocalIndexedDbStore;
  let deviceAEngine: ClientSyncEngine;

  let deviceBDb: LocalIndexedDbStore;
  let deviceBEngine: ClientSyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantA = {
      tenantId: "tenant-converge-alpha",
      branchId: "branch-converge-main",
      userId: "user-alpha-01",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    branchA2 = {
      tenantId: "tenant-converge-alpha",
      branchId: "branch-converge-sub",
      userId: "user-alpha-02",
      roles: ["CASHIER"],
      permissions: ["products:read", "sales:create"],
    };

    tenantB = {
      tenantId: "tenant-converge-beta",
      branchId: "branch-beta-main",
      userId: "user-beta-01",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    serverCommercialRepo = new ScopedCommercialRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(serverProductRepo, serverStockRepo, serverCommercialRepo, globalInMemoryStore);

    deviceADb = new LocalIndexedDbStore();
    deviceAEngine = new ClientSyncEngine("device-pos-alpha", deviceADb);

    deviceBDb = new LocalIndexedDbStore();
    deviceBEngine = new ClientSyncEngine("device-pos-beta", deviceBDb);
  });

  // 1. Single device: create -> sync -> reload -> bootstrap -> verify
  it("Gate 1: Single device create -> sync -> cold reload -> bootstrap restores exact state", async () => {
    const prodId = randomUUID();
    const varId = randomUUID();
    const now = new Date().toISOString();

    deviceADb.recordOutboxMutation({
      id: "OP-BOOT-001",
      entityType: "Product",
      entityId: prodId,
      operationType: "CREATE",
      payload: { name: "Kilimanjaro Coffee", sku: "KILI-001", category: "Beverages" },
      clientCreatedAt: now,
      idempotencyKey: "dev-a/kili-prod",
      status: "PENDING",
      tenantId: tenantA.tenantId,
    });

    deviceADb.recordOutboxMutation({
      id: "OP-BOOT-002",
      entityType: "ProductVariant",
      entityId: varId,
      operationType: "CREATE",
      payload: { productId: prodId, name: "500g Whole Bean", sku: "KILI-500G", price: 25000, costPrice: 15000 },
      clientCreatedAt: now,
      idempotencyKey: "dev-a/kili-var",
      status: "PENDING",
      tenantId: tenantA.tenantId,
    });

    deviceADb.recordOutboxMutation({
      id: "OP-BOOT-003",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: {
        variantId: varId,
        adjustmentType: "INCREASE",
        quantityChange: 150,
        reason: "Roastery Shipment",
        deviceId: "device-pos-alpha",
        operationId: "OP-BOOT-003",
        idempotencyKey: "dev-a/kili-stock",
      },
      clientCreatedAt: now,
      idempotencyKey: "dev-a/kili-stock",
      status: "PENDING",
      tenantId: tenantA.tenantId,
    });

    // Sync to server
    const syncRes = await deviceAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantA, req),
      async (since) => syncEngine.processDelta(tenantA, { since }),
      tenantA.tenantId
    );
    expect(syncRes.pushed).toBe(3);

    // Simulate complete device restart / local database cold start
    const coldDb = new LocalIndexedDbStore();
    const coldEngine = new ClientSyncEngine("device-pos-alpha-cold", coldDb);
    expect(coldDb.products.size).toBe(0);

    // Cold device executes bootstrap
    const bootResult = await coldEngine.bootstrapWithServer(
      async (req) => syncEngine.processBootstrap(tenantA, req),
      tenantA.tenantId,
      tenantA.branchId
    );
    expect(bootResult.applied).toBeGreaterThanOrEqual(3);

    // Verify converged cold state
    expect(coldDb.products.size).toBe(1);
    expect(coldDb.productVariants.size).toBe(1);
    expect(coldDb.stockLedger.size).toBe(1);

    const product = coldDb.products.get(prodId);
    expect(product).toBeDefined();
    expect(product!.name).toBe("Kilimanjaro Coffee");
    expect(product!.stock).toBe(150);
  });

  // 2. Two devices: Device A mutation, Device B mutation -> sync both -> verify convergence
  it("Gate 2: Two devices concurrent offline mutations converge to identical authoritative state", async () => {
    // Initial product and variant on server
    const prod = serverProductRepo.createProduct(tenantA, {
      name: "Safari Green Tea",
      sku: "SAFARI-TEA",
      variants: [{ name: "Box 50s", sku: "SAFARI-50", price: 12000, costPrice: 7000 }],
    });
    const varId = prod.variants![0].id;

    // Both devices bootstrap initial state
    await deviceAEngine.bootstrapWithServer(
      async (req) => syncEngine.processBootstrap(tenantA, req),
      tenantA.tenantId
    );
    await deviceBEngine.bootstrapWithServer(
      async (req) => syncEngine.processBootstrap(tenantA, req),
      tenantA.tenantId
    );

    // Device A records incoming stock (+100) offline
    deviceADb.recordOutboxMutation({
      id: "OP-DEV-A-01",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: {
        variantId: varId,
        adjustmentType: "INCREASE",
        quantityChange: 100,
        reason: "Warehouse Receipt",
        deviceId: "device-pos-alpha",
        operationId: "OP-DEV-A-01",
        idempotencyKey: "DEV-A/INTAKE-01",
      },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "DEV-A/INTAKE-01",
      status: "PENDING",
      tenantId: tenantA.tenantId,
    });

    // Device B records a sale (-10) offline
    deviceBDb.recordOutboxMutation({
      id: "OP-DEV-B-01",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: {
        variantId: varId,
        adjustmentType: "DECREASE",
        quantityChange: 10,
        reason: "Customer POS Sale",
        deviceId: "device-pos-beta",
        operationId: "OP-DEV-B-01",
        idempotencyKey: "DEV-B/SALE-01",
      },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "DEV-B/SALE-01",
      status: "PENDING",
      tenantId: tenantA.tenantId,
    });

    // Sync Device A to server
    await deviceAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantA, req),
      async (since) => syncEngine.processDelta(tenantA, { since }),
      tenantA.tenantId
    );

    // Sync Device B to server
    await deviceBEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantA, req),
      async (since) => syncEngine.processDelta(tenantA, { since }),
      tenantA.tenantId
    );

    // Sync Device A again to receive Device B's delta
    await deviceAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantA, req),
      async (since) => syncEngine.processDelta(tenantA, { since }),
      tenantA.tenantId
    );

    // Verify Server State: 100 - 10 = 90
    const serverStock = serverStockRepo.getAvailableStock(tenantA, varId);
    expect(serverStock).toBe(90);

    // Verify Device A and Device B convergence
    const stockA = calculateAvailableStock(Array.from(deviceADb.stockLedger.values()).filter((l) => l.variantId === varId));
    const stockB = calculateAvailableStock(Array.from(deviceBDb.stockLedger.values()).filter((l) => l.variantId === varId));

    expect(stockA).toBe(90);
    expect(stockB).toBe(90);
    expect(deviceADb.stockLedger.size).toBe(deviceBDb.stockLedger.size);
  });

  // 3. Duplicate Delivery: same operation sent N times -> exactly 1 business effect
  it("Gate 3: Idempotency eliminates duplicate business effects upon repeated delivery", async () => {
    const prod = serverProductRepo.createProduct(tenantA, {
      name: "Serengeti Lager",
      sku: "SERENGETI-LAGER",
      variants: [{ name: "500ml Bottle", sku: "SERENGETI-500", price: 3500, costPrice: 2000 }],
    });
    const varId = prod.variants![0].id;
    const opId = randomUUID();
    const idempKey = "KEY-DUPLICATE-TEST-001";

    const payload = {
      variantId: varId,
      adjustmentType: "INCREASE",
      quantityChange: 50,
      reason: "Initial Stocking",
      deviceId: "device-pos-alpha",
      operationId: opId,
      idempotencyKey: idempKey,
    };

    const pushReq = {
      deviceId: "device-pos-alpha",
      operations: [
        {
          operationId: opId,
          entityType: "StockAdjustment",
          entityId: randomUUID(),
          operationType: "CREATE" as const,
          payload,
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: idempKey,
        },
      ],
    };

    // First delivery -> SUCCESS
    const res1 = syncEngine.processPush(tenantA, pushReq);
    expect(res1.processedCount).toBe(1);
    expect(res1.results[0].status).toBe("SUCCESS");

    // Replay 1 -> ALREADY_PROCESSED
    const res2 = syncEngine.processPush(tenantA, pushReq);
    expect(res2.processedCount).toBe(0);
    expect(res2.results[0].status).toBe("ALREADY_PROCESSED");

    // Replay 2 -> ALREADY_PROCESSED
    const res3 = syncEngine.processPush(tenantA, pushReq);
    expect(res3.processedCount).toBe(0);
    expect(res3.results[0].status).toBe("ALREADY_PROCESSED");

    // Total stock must be exactly 50, NOT 150
    const stock = serverStockRepo.getAvailableStock(tenantA, varId);
    expect(stock).toBe(50);
  });

  // 4. Timeout & Retry: server commits, client retries -> returns ALREADY_PROCESSED with zero loss
  it("Gate 4: Network timeout retry safety with idempotent recovery", async () => {
    const custId = randomUUID();
    const opId = randomUUID();
    const idempKey = `CUST-IDEMP-${randomUUID()}`;

    deviceADb.recordOutboxMutation({
      id: opId,
      entityType: "Customer",
      entityId: custId,
      operationType: "CREATE",
      payload: { name: "Zanzibar Spice Exporters", phone: "+255777123456", email: "info@zanzibarspice.co.tz" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: idempKey,
      status: "PENDING",
      tenantId: tenantA.tenantId,
    });

    // Simulate simulated network failure after server commits
    let networkAttempt = 0;
    const resilientPushApi = async (req: any) => {
      networkAttempt++;
      if (networkAttempt === 1) {
        // Server actually processes the request
        syncEngine.processPush(tenantA, req);
        // But client connection times out before receiving the 200 OK!
        throw new Error("ETIMEDOUT: Connection dropped before receiving acknowledgement");
      }
      // Second attempt (client retrying): server responds with ALREADY_PROCESSED
      return syncEngine.processPush(tenantA, req);
    };

    // First push fails due to network timeout
    await expect(
      deviceAEngine.syncWithServer(
        resilientPushApi,
        async (since) => syncEngine.processDelta(tenantA, { since }),
        tenantA.tenantId
      )
    ).rejects.toThrow("ETIMEDOUT");

    // Client outbox remains durable (status: PENDING)
    const pendingBeforeRetry = deviceADb.getPendingOutbox(tenantA.tenantId);
    expect(pendingBeforeRetry).toHaveLength(1);

    // Client retries push -> server recognizes idempotencyKey and acknowledges
    const retryRes = await deviceAEngine.syncWithServer(
      resilientPushApi,
      async (since) => syncEngine.processDelta(tenantA, { since }),
      tenantA.tenantId
    );

    // Outbox item is now confirmed
    const pendingAfterRetry = deviceADb.getPendingOutbox(tenantA.tenantId);
    expect(pendingAfterRetry).toHaveLength(0);

    // Exactly 1 customer exists on server
    const customers = serverCommercialRepo.getCustomers(tenantA);
    expect(customers.filter((c) => c.id === custId)).toHaveLength(1);
  });

  // 5. Tenant Isolation: zero cross-tenant leakage during synchronization
  it("Gate 5: Strict tenant segregation prevents cross-tenant data leakage", async () => {
    // Tenant A creates private product
    const prodAId = randomUUID();
    deviceADb.recordOutboxMutation({
      id: "OP-TENANT-A",
      entityType: "Product",
      entityId: prodAId,
      operationType: "CREATE",
      payload: { name: "Tenant A Secret Blend", sku: "SKU-TENANT-A" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "KEY-TENANT-A",
      status: "PENDING",
      tenantId: tenantA.tenantId,
    });

    // Device A pushes to Tenant A
    await deviceAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantA, req),
      async (since) => syncEngine.processDelta(tenantA, { since }),
      tenantA.tenantId
    );

    // Device B tries to sync under Tenant B context
    await deviceBEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantB, req),
      async (since) => syncEngine.processDelta(tenantB, { since }),
      tenantB.tenantId
    );

    // Tenant B local database must have ZERO records from Tenant A
    expect(deviceBDb.products.has(prodAId)).toBe(false);
    expect(deviceBDb.getProductsLocal(tenantB.tenantId)).toHaveLength(0);

    // Device B attempts malicious cross-tenant injection into Tenant A
    const maliciousReq = {
      deviceId: "device-pos-beta",
      operations: [
        {
          operationId: randomUUID(),
          entityType: "Product",
          entityId: randomUUID(),
          operationType: "CREATE" as const,
          payload: { name: "Injected Malicious Item", sku: "INJECT-001" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "MALICIOUS-KEY-001",
        },
      ],
    };

    // Authenticated Tenant B context cannot mutate Tenant A
    syncEngine.processPush(tenantB, maliciousReq);
    const tenantAProducts = serverProductRepo.getProducts(tenantA);
    expect(tenantAProducts.some((p) => p.sku === "INJECT-001")).toBe(false);
  });

  // 6. Branch Scoping: branch authorization and multi-branch isolation
  it("Gate 6: Branch-scoped data respects branch boundary", async () => {
    // Branch Main receives 100 units
    const prod = serverProductRepo.createProduct(tenantA, {
      name: "Mineral Water",
      sku: "WATER-001",
      variants: [{ name: "500ml", sku: "WATER-500", price: 1000, costPrice: 500 }],
    });
    const varId = prod.variants![0].id;

    serverStockRepo.recordStockAdjustment(tenantA, {
      variantId: varId,
      adjustmentType: "INCREASE",
      quantityChange: 100,
      reason: "Main Branch Intake",
      deviceId: "dev-main",
      operationId: randomUUID(),
      idempotencyKey: "INTAKE-MAIN-01",
    });

    // Branch Sub pulls delta for its branch -> must NOT see Main branch exclusive product
    const subDelta = syncEngine.processDelta(branchA2, { since: "1970-01-01T00:00:00.000Z" });
    expect(subDelta.products).toHaveLength(0);

    // Main Branch pulls delta -> sees its product
    const mainDelta = syncEngine.processDelta(tenantA, { since: "1970-01-01T00:00:00.000Z" });
    expect(mainDelta.products).toHaveLength(1);
  });


  // 7. Reconciliation Engine: accurately detects missing entities, extra entities, and stock divergence
  it("Gate 7: Machine-readable reconciliation engine detects discrepancies and passes when converged", async () => {
    const prod = serverProductRepo.createProduct(tenantA, {
      name: "Tanzanian Cashews",
      sku: "CASHEW-001",
      variants: [{ name: "250g Salted", sku: "CASHEW-250", price: 8000, costPrice: 4500 }],
    });
    const varId = prod.variants![0].id;

    serverStockRepo.recordStockAdjustment(tenantA, {
      variantId: varId,
      adjustmentType: "INCREASE",
      quantityChange: 40,
      reason: "Initial Stock",
      deviceId: "server-dev",
      operationId: randomUUID(),
      idempotencyKey: "CASHEW-STOCK-01",
    });

    // Device A bootstraps
    await deviceAEngine.bootstrapWithServer(
      async (req) => syncEngine.processBootstrap(tenantA, req),
      tenantA.tenantId
    );

    // Initial reconciliation check -> IN_SYNC
    const recon1 = await deviceAEngine.reconcileWithServer(
      async (manifest) => syncEngine.reconcileState(tenantA, manifest),
      tenantA.tenantId
    );
    expect(recon1.inSync).toBe(true);
    expect(recon1.totalDiscrepancies).toBe(0);

    // Simulate divergence: client locally tampers with stock number without ledger movement
    const divergentManifest = deviceADb.generateStateManifest("device-pos-alpha", tenantA.tenantId);
    divergentManifest.stockBalances = { [varId]: 999 }; // Divergent!

    const recon2 = syncEngine.reconcileState(tenantA, divergentManifest);
    expect(recon2.inSync).toBe(false);
    expect(recon2.totalDiscrepancies).toBe(1);
    expect(recon2.discrepancies[0].kind).toBe("STOCK_MISMATCH");
    expect(recon2.discrepancies[0].serverValue).toBe(40);
    expect(recon2.discrepancies[0].clientValue).toBe(999);
  });

  // 8. PWA Schema Migration: Pending outbox survives migration without loss
  it("Gate 8: Schema migration preserves pending outbox mutations without data loss", async () => {
    const outboxOpId = "OP-PRE-MIGRATION-001";
    deviceADb.recordOutboxMutation({
      id: outboxOpId,
      entityType: "Product",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: { name: "Pre-Migration Saved Draft", sku: "MIGRATE-001" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "IDEMP-MIGRATE-001",
      status: "PENDING",
      tenantId: tenantA.tenantId,
    });

    expect(deviceADb.getPendingOutbox(tenantA.tenantId)).toHaveLength(1);

    // Migrate database to higher version
    const migrationResult = await deviceADb.migrateToVersion(5);
    expect(migrationResult.newVersion).toBe(5);
    expect(migrationResult.preservedOutboxCount).toBe(1);

    // Verify outbox item is still present and valid after migration
    const pendingAfter = deviceADb.getPendingOutbox(tenantA.tenantId);
    expect(pendingAfter).toHaveLength(1);
    expect(pendingAfter[0].id).toBe(outboxOpId);
  });

  // 9. Product + Variant Integrity: Parent stock recalculation and no variant loss
  it("Gate 9: Multi-variant product parent stock is calculated from active variants and variants never vanish", async () => {
    const parentId = randomUUID();
    const var1Id = randomUUID();
    const var2Id = randomUUID();

    // Create parent and variants locally
    deviceADb.saveProductWithVariantsLocal(
      {
        id: parentId,
        name: "Mt. Meru Organic Honey",
        sku: "HONEY-PARENT",
        hasVariants: true,
        tenantId: tenantA.tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      [
        {
          id: var1Id,
          productId: parentId,
          name: "250g Jar",
          sku: "HONEY-250",
          price: 6000,
          costPrice: 3500,
          inventoryQuantity: 30,
          stock: 30,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
        {
          id: var2Id,
          productId: parentId,
          name: "500g Jar",
          sku: "HONEY-500",
          price: 11000,
          costPrice: 6500,
          inventoryQuantity: 20,
          stock: 20,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
      ],
      { tenantId: tenantA.tenantId }
    );

    // Parent product stock must be derived: 30 + 20 = 50
    const parentProd = deviceADb.products.get(parentId);
    expect(parentProd).toBeDefined();
    expect(parentProd!.stock).toBe(50);

    // Deleting 1 variant recalculates parent stock to 30
    deviceADb.deleteVariantLocal(var1Id);
    const updatedParent = deviceADb.products.get(parentId);
    expect(updatedParent!.stock).toBe(20);
    expect(deviceADb.productVariants.has(var2Id)).toBe(true);
  });
});
