import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine";
import type { TenantContext } from "@kwakopos2/contracts";
import { calculateAvailableStock } from "@kwakopos2/domain";
import { randomUUID } from "crypto";

describe("Hardened Multi-Device Sync Convergence Test Suite", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let syncEngine: SyncEngine;

  let browserADb: LocalIndexedDbStore;
  let browserAEngine: ClientSyncEngine;

  let browserBDb: LocalIndexedDbStore;
  let browserBEngine: ClientSyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-cert-001",
      branchId: "branch-cert-001",
      userId: "user-cert-001",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);

    browserADb = new LocalIndexedDbStore();
    browserAEngine = new ClientSyncEngine("device-browser-A", browserADb);

    browserBDb = new LocalIndexedDbStore();
    browserBEngine = new ClientSyncEngine("device-browser-B", browserBDb);
  });

  it("Executes full Browser A -> Server -> Browser B convergence cycle", async () => {
    const productId = randomUUID();
    const variant1Id = randomUUID();
    const now = new Date().toISOString();

    browserADb.recordOutboxMutation({
      id: "OP-A-001",
      entityType: "Product",
      entityId: productId,
      operationType: "CREATE",
      payload: { name: "Fanta Orange", sku: "FANTA-PARENT", category: "Soft Drinks" },
      clientCreatedAt: now,
      idempotencyKey: "DEV-A/OP-A-001",
      status: "PENDING",
    });

    browserADb.recordOutboxMutation({
      id: "OP-A-002",
      entityType: "ProductVariant",
      entityId: variant1Id,
      operationType: "CREATE",
      payload: { productId, name: "350ml Glass", sku: "FANTA-350", price: 1.2, costPrice: 0.8 },
      clientCreatedAt: now,
      idempotencyKey: "DEV-A/OP-A-002",
      status: "PENDING",
    });

    browserADb.recordOutboxMutation({
      id: "OP-A-003",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: {
        variantId: variant1Id,
        adjustmentType: "INCREASE",
        quantityChange: 100,
        reason: "Opening Stock",
        deviceId: "device-browser-A",
        operationId: "OP-A-003",
        idempotencyKey: "DEV-A/OP-A-003",
      },
      clientCreatedAt: now,
      idempotencyKey: "DEV-A/OP-A-003",
      status: "PENDING",
    });

    browserADb.recordOutboxMutation({
      id: "OP-A-004",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: {
        variantId: variant1Id,
        adjustmentType: "DECREASE",
        quantityChange: 5,
        reason: "Damaged bottle",
        deviceId: "device-browser-A",
        operationId: "OP-A-004",
        idempotencyKey: "DEV-A/OP-A-004",
      },
      clientCreatedAt: now,
      idempotencyKey: "DEV-A/OP-A-004",
      status: "PENDING",
    });

    // Browser A syncs initial batch to Server
    await browserAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    // Browser A goes OFFLINE and performs local mutation
    const variant2Id = randomUUID();
    browserADb.recordOutboxMutation({
      id: "OP-A-005",
      entityType: "ProductVariant",
      entityId: variant2Id,
      operationType: "CREATE",
      payload: { productId, name: "500ml PET", sku: "FANTA-500", price: 1.8, costPrice: 1.2 },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "DEV-A/OP-A-005",
      status: "PENDING",
    });

    // Browser A reconnects & Syncs to Server
    await browserAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    // Verify Server State
    const serverProduct = serverProductRepo.getProductById(tenantCtx, productId);
    expect(serverProduct).not.toBeNull();
    expect(serverProduct!.variants).toHaveLength(2);

    const stockVariant1 = serverStockRepo.getAvailableStock(tenantCtx, variant1Id);
    expect(stockVariant1).toBe(95);

    // Browser B Syncs Delta from Server
    await browserBEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    expect(browserBDb.products.size).toBe(1);
    expect(browserBDb.productVariants.size).toBe(2);

    const bStockLedger = Array.from(browserBDb.stockLedger.values()).filter((l) => l.variantId === variant1Id);
    const bCalculatedStock = calculateAvailableStock(bStockLedger);
    expect(bCalculatedStock).toBe(95);

    expect(browserADb.products.size).toEqual(browserBDb.products.size);
    expect(browserADb.productVariants.size).toEqual(browserBDb.productVariants.size);
  });

  it("Executes Reverse Flow (Browser B -> Server -> Browser A)", async () => {
    // Initial product on server
    const prod = serverProductRepo.createProduct(tenantCtx, {
      name: "Water Bottle",
      sku: "WATER-01",
      variants: [{ name: "1L", sku: "WATER-1L", price: 1.0, costPrice: 0.5 }],
    });
    const varId = prod.variants![0].id;

    // Both browsers sync initial state
    await browserAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );
    await browserBEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    // Browser B records offline adjustment (-10)
    browserBDb.recordOutboxMutation({
      id: "OP-B-001",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: {
        variantId: varId,
        adjustmentType: "DECREASE",
        quantityChange: 10,
        reason: "Stock Audit Reduction",
        deviceId: "device-browser-B",
        operationId: "OP-B-001",
        idempotencyKey: "DEV-B/OP-B-001",
      },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "DEV-B/OP-B-001",
      status: "PENDING",
    });

    // Browser B syncs to Server
    await browserBEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    // Browser A pulls delta from Server
    await browserAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    // Both browsers have identical calculated stock
    const stockA = calculateAvailableStock(Array.from(browserADb.stockLedger.values()).filter((l) => l.variantId === varId));
    const stockB = calculateAvailableStock(Array.from(browserBDb.stockLedger.values()).filter((l) => l.variantId === varId));
    expect(stockA).toBe(-10);
    expect(stockB).toBe(-10);
  });
});
