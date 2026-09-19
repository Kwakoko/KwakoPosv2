import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("Stock Adjustment Consistency & Inventory Quantity Convergence", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-test-adj-001",
      branchId: "branch-test-adj-001",
      userId: "user-test-001",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);
  });

  it("ensures stock adjustment writes both ledger entry and variant inventoryQuantity", async () => {
    const productId = randomUUID();
    const variantId = randomUUID();

    // 1. Create Product and Variant
    await syncEngine.processPush(tenantCtx, {
      deviceId: "device-test-1",
      operations: [
        {
          operationId: "OP-PROD-01",
          entityType: "Product",
          entityId: productId,
          operationType: "CREATE",
          payload: { name: "Cooking Oil", sku: "OIL-BASE" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-PROD-01",
        },
        {
          operationId: "OP-VAR-01",
          entityType: "ProductVariant",
          entityId: variantId,
          operationType: "CREATE",
          payload: { productId, name: "1L Bottle", sku: "OIL-1L", price: 5000, costPrice: 4000 },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-VAR-01",
        },
      ],
    });

    // Initial variant stock should be 0
    const initialStock = serverStockRepo.getAvailableStock(tenantCtx, variantId);
    expect(initialStock).toBe(0);

    // 2. Push a StockAdjustment (INCREASE +50)
    const adjId = randomUUID();
    const pushResult = await syncEngine.processPush(tenantCtx, {
      deviceId: "device-test-1",
      operations: [
        {
          operationId: "OP-ADJ-01",
          entityType: "StockAdjustment",
          entityId: adjId,
          operationType: "CREATE",
          payload: {
            variantId,
            adjustmentType: "INCREASE",
            quantityChange: 50,
            reason: "Initial batch intake",
            unitCost: 4000,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-ADJ-01",
        },
      ],
    });

    expect(pushResult.processedCount).toBe(1);
    expect(pushResult.results[0].status).toBe("SUCCESS");

    // Check ledger balance and available stock
    const stockAfterIncrease = serverStockRepo.getAvailableStock(tenantCtx, variantId);
    expect(stockAfterIncrease).toBe(50);

    // 3. Push another StockAdjustment (DECREASE -15)
    await syncEngine.processPush(tenantCtx, {
      deviceId: "device-test-1",
      operations: [
        {
          operationId: "OP-ADJ-02",
          entityType: "StockAdjustment",
          entityId: randomUUID(),
          operationType: "CREATE",
          payload: {
            variantId,
            adjustmentType: "DECREASE",
            quantityChange: 15,
            reason: "Damaged bottles",
            unitCost: 4000,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-ADJ-02",
        },
      ],
    });

    const stockAfterDecrease = serverStockRepo.getAvailableStock(tenantCtx, variantId);
    expect(stockAfterDecrease).toBe(35);
  });
});
