import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";
import "../../apps/web/src/atomicOutbox";
import { commitLocalOutbox, commitLocalOutboxes } from "../../apps/web/src/persistence/commitLocalMutation";

async function countIndexedDbTransactions(run: () => Promise<void>): Promise<{ count: number; stores: string[][] } | null> {
  const prototype = (globalThis as any).IDBDatabase?.prototype;
  const original = prototype?.transaction;
  if (!prototype || !original) {
    await run();
    return null;
  }
  let count = 0;
  const stores: string[][] = [];
  prototype.transaction = function (...args: any[]) {
    count += 1;
    const first = args[0];
    stores.push(typeof first === "string" ? [first] : Array.from(first || []));
    return original.apply(this, args);
  };
  try {
    await run();
  } finally {
    prototype.transaction = original;
  }
  return { count, stores };
}

describe("Pillar 1 — Outbox Guarantees: Unit Tests", () => {
  let db: LocalIndexedDbStore;

  beforeEach(async () => {
    db = new LocalIndexedDbStore();
    await db.ready;
  });

  it("guarantees outbox persistence: db.enqueueOutbox stores sale before any network attempt", () => {
    const saleId = "SALE-OFFLINE-001";
    const saleRecord = {
      id: saleId,
      subtotal: 100,
      grandTotal: 100,
      lines: [{ variantId: "VAR-01", quantity: 2, unitPrice: 50 }],
    };

    // 1. Enqueue to outbox first
    const outboxItem = db.enqueueOutbox({
      entityType: "Sale" as never,
      entityId: saleId,
      operationType: "CREATE",
      payload: saleRecord,
      idempotencyKey: saleId,
      tenantId: "tenant-001",
      branchId: "branch-001",
    });

    expect(outboxItem).toBeDefined();
    expect(outboxItem.id).toBeDefined();
    expect(outboxItem.status).toBe("PENDING");

    // Assert the scoped outbox queue contains this item.
    const pending = db.getPendingOutbox("tenant-001", "branch-001").filter((item) => item.entityId === saleId);
    expect(pending.length).toBe(1);
    expect(pending[0].entityId).toBe(saleId);
    expect(pending[0].idempotencyKey).toBe(saleId);
  });

  it("preserves outbox item in PENDING state when network dispatch fails after exponential backoff", async () => {
    const saleId = "SALE-OFFLINE-002";
    const saleRecord = {
      id: saleId,
      grandTotal: 250,
      lines: [{ variantId: "VAR-02", quantity: 1, unitPrice: 250 }],
    };

    // Outbox-first pattern
    const outboxItem = db.enqueueOutbox({
      entityType: "Sale" as never,
      entityId: saleId,
      operationType: "CREATE",
      payload: saleRecord,
      idempotencyKey: saleId,
      tenantId: "tenant-001",
      branchId: "branch-001",
    });

    // Mock network dispatch that fails all attempts
    const fakeApiFetch = vi.fn().mockRejectedValue(new Error("Network connection dropped: ERR_INTERNET_DISCONNECTED"));
    const delays = [10, 20, 30]; // scaled down for fast unit testing
    let synced = false;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        await fakeApiFetch("/api/v1/pos/sales", {
          method: "POST",
          body: JSON.stringify(saleRecord),
        });
        db.markOutboxSynced(outboxItem.id);
        synced = true;
        break;
      } catch {
        if (attempt < delays.length) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
      }
    }

    expect(synced).toBe(false);
    expect(fakeApiFetch).toHaveBeenCalledTimes(4); // initial + 3 retries

    // Crucial guarantee: this sale was NOT lost or marked synced.
    const pending = db.getPendingOutbox("tenant-001", "branch-001").filter((item) => item.entityId === saleId);
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe("PENDING");
    expect(pending[0].entityId).toBe(saleId);
  });

  it("commits legacy saveXLocal + multiple enqueueOutbox calls as one durable IndexedDB batch", async () => {
    await db.ready;
    const ctx = { tenantId: `tenant-atomic-${Date.now()}`, branchId: "branch-atomic" };
    const productId = `product-atomic-${Date.now()}`;
    const variantId = `variant-atomic-${Date.now()}`;
    let productOutboxId = "";
    let variantOutboxId = "";

    const transactionCount = await countIndexedDbTransactions(async () => {
      db.saveProductLocal({
        id: productId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        name: "Atomic Batch Product",
        sku: "ATOMIC-BATCH",
        variants: [],
      } as any, ctx);
      db.saveVariantLocal({
        id: variantId,
        productId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        name: "Standard",
        sku: "ATOMIC-BATCH-STD",
        price: 100,
        inventoryQuantity: 0,
        stock: 0,
      } as any, ctx);

      const productOutbox = db.enqueueOutbox({
        entityType: "Product",
        entityId: productId,
        operationType: "CREATE",
        payload: { id: productId, name: "Atomic Batch Product", sku: "ATOMIC-BATCH" },
        idempotencyKey: `ATOMIC-PRODUCT-${productId}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
      });
      const variantOutbox = db.enqueueOutbox({
        entityType: "ProductVariant",
        entityId: variantId,
        operationType: "CREATE",
        payload: { id: variantId, productId, name: "Standard", sku: "ATOMIC-BATCH-STD" },
        idempotencyKey: `ATOMIC-VARIANT-${variantId}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
      });

      productOutboxId = productOutbox.id;
      variantOutboxId = variantOutbox.id;
      await db.flushPersistence();
    });

    const reopened = new LocalIndexedDbStore();
    await reopened.ready;
    expect(reopened.products.get(productId)?.sku).toBe("ATOMIC-BATCH");
    expect(reopened.productVariants.get(variantId)?.sku).toBe("ATOMIC-BATCH-STD");
    expect(reopened.syncOutbox.get(productOutboxId)?.status).toBe("PENDING");
    expect(reopened.syncOutbox.get(variantOutboxId)?.status).toBe("PENDING");
    expect(reopened.getPendingOutbox(ctx.tenantId, ctx.branchId).map((item) => item.id)).toEqual(
      expect.arrayContaining([productOutboxId, variantOutboxId]),
    );
    if (transactionCount) {
      const atomicTransactions = transactionCount.stores.filter((stores) => stores.includes("syncOutbox") && stores.includes("syncMetadata"));
      expect(atomicTransactions).toHaveLength(1);
      expect(atomicTransactions[0]).toEqual(expect.arrayContaining(["products", "productVariants", "syncOutbox", "syncMetadata"]));
    }
  });

  it("also batches enqueueOutbox followed by a same-turn saveXLocal mutation", async () => {
    await db.ready;
    const ctx = { tenantId: `tenant-atomic-reverse-${Date.now()}`, branchId: "branch-atomic" };
    const customerId = `customer-atomic-${Date.now()}`;
    let outboxId = "";

    const transactionCount = await countIndexedDbTransactions(async () => {
      const outboxItem = db.enqueueOutbox({
        entityType: "Customer",
        entityId: customerId,
        operationType: "CREATE",
        payload: { id: customerId, name: "Atomic Customer" },
        idempotencyKey: `ATOMIC-CUSTOMER-${customerId}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
      });
      outboxId = outboxItem.id;
      db.saveCustomerLocal({
        id: customerId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        name: "Atomic Customer",
        updatedAt: new Date().toISOString(),
      }, ctx);
      await db.flushPersistence();
    });

    const reopened = new LocalIndexedDbStore();
    await reopened.ready;
    expect(reopened.customers.get(customerId)?.name).toBe("Atomic Customer");
    expect(reopened.syncOutbox.get(outboxId)?.status).toBe("PENDING");
    if (transactionCount) {
      const atomicTransactions = transactionCount.stores.filter((stores) => stores.includes("syncOutbox") && stores.includes("syncMetadata"));
      expect(atomicTransactions).toHaveLength(1);
      expect(atomicTransactions[0]).toEqual(expect.arrayContaining(["customers", "syncOutbox", "syncMetadata"]));
    }
  });

  it("marks outbox item as SYNCED only upon verified server acknowledgment", async () => {
    const saleId = "SALE-ONLINE-003";
    const saleRecord = {
      id: saleId,
      grandTotal: 150,
    };

    const outboxItem = db.enqueueOutbox({
      entityType: "Sale" as never,
      entityId: saleId,
      operationType: "CREATE",
      payload: saleRecord,
      idempotencyKey: saleId,
      tenantId: "tenant-001",
      branchId: "branch-001",
    });

    expect(db.getPendingOutbox("tenant-001", "branch-001").filter((item) => item.entityId === saleId).length).toBe(1);

    // Mock successful server response
    const fakeApiFetch = vi.fn().mockResolvedValue({ success: true, saleId });
    const res = await fakeApiFetch("/api/v1/pos/sales", { method: "POST" });
    if (res) {
      db.markOutboxSynced(outboxItem.id);
    }

    // Now this sale should be SYNCED, not pending.
    expect(db.getPendingOutbox("tenant-001", "branch-001").filter((queued) => queued.entityId === saleId).length).toBe(0);
    const item = db.syncOutbox.get(outboxItem.id);
    expect(item?.status).toBe("SYNCED");
  });
});


  it("commitLocalOutbox atomically binds a prior saveXLocal mutation even across the persistence microtask boundary", async () => {
    const ctx = { tenantId: `tenant-helper-${Date.now()}`, branchId: "branch-helper" };
    const db = new LocalIndexedDbStore();
    await db.ready;
    const customerId = `customer-helper-${Date.now()}`;

    const transactionCount = await countIndexedDbTransactions(async () => {
      db.saveCustomerLocal({
        id: customerId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        name: "Helper Atomic Customer",
        updatedAt: new Date().toISOString(),
      }, ctx);

      await commitLocalOutbox(db, {
        entityType: "Customer",
        entityId: customerId,
        operationType: "CREATE",
        payload: { id: customerId, name: "Helper Atomic Customer" },
        idempotencyKey: `HELPER-CUSTOMER-${customerId}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
      });
    });

    const reopened = new LocalIndexedDbStore();
    await reopened.ready;
    expect(reopened.customers.get(customerId)?.name).toBe("Helper Atomic Customer");
    expect(reopened.getPendingOutbox(ctx.tenantId, ctx.branchId).some((item) => item.entityId === customerId)).toBe(true);
    if (transactionCount) {
      const atomicTransactions = transactionCount.stores.filter((stores) => stores.includes("customers") && stores.includes("syncOutbox"));
      expect(atomicTransactions).toHaveLength(1);
    }
  });

  it("commitLocalOutbox rejects an unscoped mutation before writing anything", async () => {
    const localDb = new LocalIndexedDbStore();
    await localDb.ready;
    await expect(commitLocalOutbox(localDb, {
      entityType: "Customer",
      entityId: "unscoped-customer",
      operationType: "CREATE",
      payload: { name: "Unscoped" },
      idempotencyKey: "UNSCOPED-CUSTOMER",
    })).rejects.toThrow("TENANT_CONTEXT_REQUIRED_FOR_LOCAL_MUTATION");
    expect(localDb.syncOutbox.has("UNSCOPED-CUSTOMER")).toBe(false);
  });


  it("commitLocalOutboxes commits multiple outboxes and explicit deletes in one durable transaction", async () => {
    const db = new LocalIndexedDbStore();
    await db.ready;
    const ctx = { tenantId: `tenant-batch-${Date.now()}`, branchId: "branch-batch" };
    const productId = `product-batch-${Date.now()}`;
    const customerId = `customer-batch-${Date.now()}`;

    db.saveProductLocal({
      id: productId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: "Batch Delete Target",
      sku: "BATCH-DELETE",
      variants: [],
    } as any, ctx);
    await db.flushPersistence();
    db.deleteProductLocal(productId);
    db.saveCustomerLocal({
      id: customerId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: "Batch Customer",
    }, ctx);

    const transactionCount = await countIndexedDbTransactions(async () => {
      await commitLocalOutboxes(db, [
        {
          entityType: "Product",
          entityId: productId,
          operationType: "DELETE",
          payload: { id: productId },
          idempotencyKey: `BATCH-PRODUCT-${productId}`,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
        },
        {
          entityType: "Customer",
          entityId: customerId,
          operationType: "CREATE",
          payload: { id: customerId, name: "Batch Customer" },
          idempotencyKey: `BATCH-CUSTOMER-${customerId}`,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
        },
      ], ctx);
    });

    const reopened = new LocalIndexedDbStore();
    await reopened.ready;
    expect(reopened.products.has(productId)).toBe(false);
    expect(reopened.customers.get(customerId)?.name).toBe("Batch Customer");
    expect(reopened.getPendingOutbox(ctx.tenantId, ctx.branchId).map((item) => item.entityId)).toEqual(
      expect.arrayContaining([productId, customerId]),
    );
    if (transactionCount) {
      const atomicTransactions = transactionCount.stores.filter(
        (stores) => stores.includes("syncOutbox") && stores.includes("products") && stores.includes("customers"),
      );
      expect(atomicTransactions).toHaveLength(1);
    }
  });

  it("rejects a mixed-tenant atomic batch before touching IndexedDB", async () => {
    const db = new LocalIndexedDbStore();
    await db.ready;
    const ctx = { tenantId: "tenant-batch-a", branchId: "branch-batch" };
    await expect(commitLocalOutboxes(db, [
      { entityType: "Customer", entityId: "customer-a", operationType: "CREATE", payload: {}, idempotencyKey: "batch-a", tenantId: "tenant-batch-a" },
      { entityType: "Customer", entityId: "customer-b", operationType: "CREATE", payload: {}, idempotencyKey: "batch-b", tenantId: "tenant-batch-b" },
    ], ctx)).rejects.toThrow("ATOMIC_MUTATION_TENANT_MISMATCH");
    expect(db.syncOutbox.has("batch-a")).toBe(false);
    expect(db.syncOutbox.has("batch-b")).toBe(false);
  });
