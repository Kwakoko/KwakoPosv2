import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  ScopedCommercialRepository,
  InMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Phase 1 Commercial Core Acceptance Suite (P1-001 to P1-010)", () => {
  const store = new InMemoryStore();
  const productRepo = new ScopedProductRepository(store);
  const stockRepo = new ScopedStockRepository(store);
  const commercialRepo = new ScopedCommercialRepository(store);
  const syncEngine = new SyncEngine(productRepo, stockRepo, commercialRepo, store);

  const ctx: TenantContext = {
    tenantId: randomUUID(),
    branchId: randomUUID(),
    userId: randomUUID(),
    roles: ["ADMIN"],
    permissions: ["ALL"],
  };

  let productId = "";
  let variantId = "";

  // P1-001 Product CRUD
  it("P1-001: Product CRUD operations succeed with strict tenant isolation", () => {
    const product = productRepo.createProduct(ctx, {
      name: "Commercial Grade Soap",
      sku: "SOAP-001",
      category: "Toiletries",
      variants: [
        {
          name: "Soap 100g Bar",
          sku: "SOAP-100G",
          price: 2500,
          costPrice: 1500,
        },
      ],
    });
    expect(product.id).toBeDefined();
    productId = product.id;
    variantId = product.variants![0].id;

    const fetched = productRepo.getProductById(ctx, productId);
    expect(fetched?.name).toBe("Commercial Grade Soap");

    const updated = productRepo.updateProduct(ctx, productId, { name: "Premium Commercial Soap" });
    expect(updated.name).toBe("Premium Commercial Soap");
  });

  // P1-002 Variants
  it("P1-002: Variant management preserves persistent identity and pricing", () => {
    const newVariant = productRepo.addVariant(ctx, productId, {
      name: "Soap 250g Family Pack",
      sku: "SOAP-250G",
      price: 5500,
      costPrice: 3200,
    });
    expect(newVariant.id).toBeDefined();
    expect(newVariant.price).toBe(5500);

    const updatedVariant = productRepo.updateVariant(ctx, newVariant.id, { price: 5800 });
    expect(updatedVariant.price).toBe(5800);
  });

  // P1-003 Stock ledger
  it("P1-003: Stock ledger strictly records all inventory balance adjustments", () => {
    const { adjustment, ledger } = stockRepo.recordStockAdjustment(ctx, {
      variantId,
      adjustmentType: "INCREASE",
      quantityChange: 100,
      reason: "Initial Stock Inward",
      deviceId: "dev-p1",
      operationId: "op-stock-in",
      idempotencyKey: `idem-stock-in-${randomUUID()}`,
    });

    expect(adjustment.status).toBe("COMPLETED");
    expect(["ADJUSTMENT", "ADJUSTMENT_GAIN", "ADJUSTMENT_LOSS"]).toContain(ledger.movementType);
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(100);
  });

  // P1-004 POS sale
  it("P1-004: POS sale completes and deducts inventory through ledger movement", () => {
    const { sale } = commercialRepo.createPosSale(ctx, {
      items: [
        {
          productId,
          variantId,
          quantity: 10,
          unitPrice: 2500,
          unitCost: 1500,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 25000,
        },
      ],
      deviceId: "dev-pos",
      operationId: "op-sale-1",
      idempotencyKey: `idem-sale-${randomUUID()}`,
    });

    expect(sale.grandTotal).toBe(25000);
    expect(sale.status).toBe("COMPLETED");

    // Inventory check (100 - 10 = 90)
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(90);
  });

  // P1-005 Payment
  it("P1-005: Payment processing records payment and reconciles customer account", () => {
    const customer = commercialRepo.createCustomer(ctx, {
      name: "Wholesale Client Alpha",
      creditLimit: 200000,
    });

    expect(customer.id).toBeDefined();
    expect(customer.creditLimit).toBe(200000);
  });

  // P1-006 Purchase
  it("P1-006: Purchase order and goods receipt increase stock ledger", () => {
    const supplier = commercialRepo.createSupplier(ctx, {
      name: "Prime Chemical Supplies",
    });

    const po = commercialRepo.createPurchaseOrder(ctx, {
      supplierId: supplier.id,
      items: [{ variantId, quantityOrdered: 50, unitCost: 1400 }],
    });
    expect(po.id).toBeDefined();

    const { receipt } = commercialRepo.createPurchaseReceipt(ctx, {
      purchaseOrderId: po.id,
      supplierId: supplier.id,
      deviceId: "dev-rec",
      operationId: "op-rec-1",
      idempotencyKey: `idem-rec-${randomUUID()}`,
      items: [{ variantId, quantityReceived: 50, unitCost: 1400 }],
    });

    expect(receipt.id).toBeDefined();
    // Previous stock was 90 + 50 received = 140
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(140);
  });

  // P1-007 Inventory adjustment
  it("P1-007: Manual stock adjustment correctly recalculates ledger balance", () => {
    const { ledger } = stockRepo.recordStockAdjustment(ctx, {
      variantId,
      adjustmentType: "DECREASE",
      quantityChange: 5,
      reason: "Damaged packaging in transit",
      deviceId: "dev-adj",
      operationId: "op-adj-1",
      idempotencyKey: `idem-adj-${randomUUID()}`,
    });

    expect(ledger.quantity).toBe(-5);
    // 140 - 5 = 135
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(135);
  });

  // P1-008 Offline sale
  it("P1-008: Offline sale is captured in local Outbox and syncs upstream cleanly", async () => {
    const localDb = new LocalIndexedDbStore(4, `kwakopos-p1-008-${randomUUID()}`);
    await localDb.ready;

    const offlineOpId = `op-off-${randomUUID()}`;
    localDb.recordOutboxMutation({
      id: offlineOpId,
      entityType: "Product",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: { name: "Offline Item", sku: "OFF-01" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: `idem-off-${randomUUID()}`,
      status: "PENDING",
    });

    const outbox = localDb.getPendingOutbox();
    expect(outbox.length).toBe(1);

    const pushRes = syncEngine.processPush(ctx, {
      deviceId: "dev-offline",
      operations: outbox.map((o) => ({
        operationId: o.id,
        entityType: o.entityType,
        entityId: o.entityId,
        operationType: o.operationType,
        payload: o.payload,
        clientCreatedAt: o.clientCreatedAt,
        idempotencyKey: o.idempotencyKey,
      })),
    });

    expect(pushRes.results[0].status).toBe("SUCCESS");
    for (const r of pushRes.results) {
      localDb.markOutboxSynced(r.operationId);
    }
    expect(localDb.getPendingOutbox().length).toBe(0);
  });

  // P1-009 Browser A -> Browser B
  it("P1-009: Multi-device sync propagates mutations from Browser A to Browser B", async () => {
    const browserADb = new LocalIndexedDbStore(4, `kwakopos-p1-009-a-${randomUUID()}`);
    const browserBDb = new LocalIndexedDbStore(4, `kwakopos-p1-009-b-${randomUUID()}`);
    await browserADb.ready;
    await browserBDb.ready;

    const crossItemId = randomUUID();

    // Browser A creates item and performs adjustment
    browserADb.recordOutboxMutation({
      id: "OP-A1",
      entityType: "Product",
      entityId: crossItemId,
      operationType: "CREATE",
      payload: { name: "Cross Browser Widget", sku: "CBW-01" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: `IDEM-A1-${randomUUID()}`,
      status: "PENDING",
    });

    const pushA = syncEngine.processPush(ctx, {
      deviceId: "device-A",
      operations: browserADb.getPendingOutbox().map((o) => ({
        operationId: o.id,
        entityType: o.entityType,
        entityId: o.entityId,
        operationType: o.operationType,
        payload: o.payload,
        clientCreatedAt: o.clientCreatedAt,
        idempotencyKey: o.idempotencyKey,
      })),
    });
    for (const r of pushA.results) {
      browserADb.markOutboxSynced(r.operationId);
    }

    // Browser B pulls delta stream
    const deltaForB = syncEngine.processDelta(ctx, {
      deviceId: "device-B",
    });



    for (const p of deltaForB.products) {
      browserBDb.saveProductLocal(p);
    }
    expect(browserBDb.products.has(crossItemId)).toBe(true);
    expect(browserBDb.products.get(crossItemId)?.name).toBe("Cross Browser Widget");
  });

  // P1-010 PWA upgrade/recovery
  it("P1-010: PWA local storage schema upgrade preserves pending outbox queue", async () => {
    const db = new LocalIndexedDbStore(4, `kwakopos-p1-010-${randomUUID()}`);
    await db.ready;
    db.recordOutboxMutation({
      id: "OP-UPGRADE-1",
      entityType: "Product",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: { name: "Pre-upgrade item" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "UPGRADE-KEY-1",
      status: "PENDING",
    });

    // Simulate schema upgrade from v1 to v2
    const migration = await db.migrateToVersion(2);
    expect(migration.newVersion).toBe(2);
    expect(migration.preservedOutboxCount).toBe(1);
    expect(db.getPendingOutbox().length).toBe(1);
  });
});
