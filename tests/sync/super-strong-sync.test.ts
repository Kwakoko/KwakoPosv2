import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { InMemoryStore, ScopedProductRepository, ScopedStockRepository } from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine";
import type { TenantContext, SyncDeltaResponse, SyncPushRequest } from "@kwakopos2/contracts";

describe("Super-Strong Offline Sync", () => {
  let store: InMemoryStore;
  let engine: SyncEngine;
  const ctx: TenantContext = {
    tenantId: "tenant-strong-001",
    branchId: "branch-strong-001",
    userId: "user-strong-001",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    engine = new SyncEngine(new ScopedProductRepository(store), new ScopedStockRepository(store), store);
  });

  it("reorders dependent operations deterministically even when a device submits them backwards", () => {
    const productId = randomUUID();
    const variantId = randomUUID();
    const now = new Date().toISOString();
    const push: SyncPushRequest = {
      deviceId: "device-strong-A",
      operations: [
        {
          operationId: "stock-1",
          entityType: "StockAdjustment",
          entityId: randomUUID(),
          operationType: "CREATE",
          payload: { variantId, adjustmentType: "INCREASE", quantityChange: 25, reason: "Opening" },
          clientCreatedAt: now,
          idempotencyKey: "key-stock-1",
        },
        {
          operationId: "variant-1",
          entityType: "ProductVariant",
          entityId: variantId,
          operationType: "CREATE",
          payload: { productId, name: "1L", sku: "WATER-1L", price: 1000, costPrice: 500 },
          clientCreatedAt: now,
          idempotencyKey: "key-variant-1",
        },
        {
          operationId: "product-1",
          entityType: "Product",
          entityId: productId,
          operationType: "CREATE",
          payload: { name: "Water", sku: "WATER", category: "Drinks", hasVariants: true },
          clientCreatedAt: now,
          idempotencyKey: "key-product-1",
        },
      ],
    };

    const result = engine.processPush(ctx, push);
    expect(result.results.every((item) => item.status === "SUCCESS")).toBe(true);
    expect(store.variants.size).toBe(1);
    expect(new ScopedStockRepository(store).getAvailableStock(ctx, variantId)).toBe(25);
  });

  it("fails closed when an existing idempotency key is reused with different content", () => {
    const productId = randomUUID();
    const first = engine.processPush(ctx, {
      deviceId: "device-strong-A",
      operations: [{
        operationId: "op-idem-1",
        entityType: "Product",
        entityId: productId,
        operationType: "CREATE",
        payload: { name: "Original", sku: "ORIGINAL", category: "General" },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "stable-key",
      }],
    });
    expect(first.results[0].status).toBe("SUCCESS");

    const second = engine.processPush(ctx, {
      deviceId: "device-strong-A",
      operations: [{
        operationId: "op-idem-2",
        entityType: "Product",
        entityId: randomUUID(),
        operationType: "CREATE",
        payload: { name: "Forged", sku: "FORGED", category: "General" },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "stable-key",
      }],
    });
    expect(second.results[0].status).toBe("FAILED");
    expect(second.results[0].error).toContain("SYNC_IDEMPOTENCY_CONFLICT");
    expect(store.products.size).toBe(1);
  });

  it("rejects stale offline product updates rather than overwriting newer server state", () => {
    const repo = new ScopedProductRepository(store);
    const product = repo.createProduct(ctx, { name: "Coffee", sku: "COFFEE", category: "Drinks" });
    const staleBase = product.updatedAt;
    repo.updateProduct(ctx, product.id, { name: "Server New Name", sku: product.sku, category: "Drinks", isActive: true });

    const result = engine.processPush(ctx, {
      deviceId: "device-strong-B",
      operations: [{
        operationId: "stale-update",
        entityType: "Product",
        entityId: product.id,
        operationType: "UPDATE",
        payload: { name: "Offline Old Name", sku: product.sku, category: "Drinks", isActive: true, _baseUpdatedAt: staleBase },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "stale-update-key",
      }],
    });

    expect(result.results[0].status).toBe("FAILED");
    expect(result.results[0].error).toContain("STALE_WRITE_CONFLICT");
    expect(repo.getProductById(ctx, product.id)?.name).toBe("Server New Name");
  });

  it("propagates variant deletion as a durable tombstone rather than removing history", () => {
    const repo = new ScopedProductRepository(store);
    const product = repo.createProduct(ctx, { name: "Milk", sku: "MILK", category: "Dairy", hasVariants: true });
    const variant = repo.addVariant(ctx, product.id, { name: "500ml", sku: "MILK-500", price: 2000, costPrice: 1200 });

    const result = engine.processPush(ctx, {
      deviceId: "device-strong-A",
      operations: [{
        operationId: "variant-delete-1",
        entityType: "ProductVariant",
        entityId: variant.id,
        operationType: "DELETE",
        payload: { _baseUpdatedAt: variant.updatedAt },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "variant-delete-key",
      }],
    });

    expect(result.results[0].status).toBe("SUCCESS");
    const tombstone = store.variants.get(variant.id);
    expect(tombstone).toBeDefined();
    expect(tombstone?.isActive).toBe(false);

    const delta = engine.processDelta(ctx, { since: new Date(Date.now() - 60_000).toISOString() });
    expect(delta.variants.find((item) => item.id === variant.id)?.isActive).toBe(false);
  });

  it("applies customers and suppliers from server deltas", async () => {
    const db = new LocalIndexedDbStore();
    const customer = { id: "customer-1", tenantId: ctx.tenantId, branchId: ctx.branchId, name: "Customer One", updatedAt: new Date().toISOString() };
    const supplier = { id: "supplier-1", tenantId: ctx.tenantId, branchId: ctx.branchId, name: "Supplier One", updatedAt: new Date().toISOString() };
    const delta = {
      serverTimestamp: new Date().toISOString(),
      products: [],
      variants: [],
      stockLedger: [],
      adjustments: [],
      customers: [customer],
      suppliers: [supplier],
    } as unknown as SyncDeltaResponse;

    await db.applyServerDelta(delta);
    expect(db.customers.get(customer.id)?.name).toBe("Customer One");
    expect(db.suppliers.get(supplier.id)?.name).toBe("Supplier One");
  });

  it("does not lose an outbox operation when the server violates the one-result-per-operation protocol", async () => {
    const db = new LocalIndexedDbStore();
    db.recordOutboxMutation({
      id: "protocol-op-1",
      entityType: "Product",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: { name: "Protocol Test", sku: "PROTO", category: "General" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "protocol-key-1",
      status: "PENDING",
    });
    const client = new ClientSyncEngine("device-protocol", db);
    await expect(client.syncWithServer(
      async () => ({ processedCount: 0, results: [] }),
      async () => ({ serverTimestamp: new Date().toISOString(), products: [], variants: [], stockLedger: [], adjustments: [], customers: [], suppliers: [] } as unknown as SyncDeltaResponse),
    )).rejects.toThrow("SYNC_PROTOCOL_VIOLATION");
    expect(db.getPendingOutbox().map((item) => item.id)).toContain("protocol-op-1");
  });

  it("rejects oversized push batches before business mutation", () => {
    const operations = Array.from({ length: 501 }, (_, index) => ({
      operationId: `op-${index}`,
      entityType: "Product" as const,
      entityId: randomUUID(),
      operationType: "CREATE" as const,
      payload: { name: `P-${index}`, sku: `SKU-${index}`, category: "General" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: `key-${index}`,
    }));
    expect(() => engine.processPush(ctx, { deviceId: "device-large", operations })).toThrow("SYNC_BATCH_TOO_LARGE");
    expect(store.products.size).toBe(0);
  });
});
