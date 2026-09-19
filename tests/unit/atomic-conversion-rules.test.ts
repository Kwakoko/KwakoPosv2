import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import type { TenantContext, SyncPushRequest } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("Pillar 3 — Atomic Conversion Rules: Unit Tests", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-atomic-001",
      branchId: "branch-atomic-001",
      userId: "user-atomic-001",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);
  });

  it("updates both StockLedger and productVariant.inventoryQuantity in one transaction on StockAdjustment", async () => {
    const productId = randomUUID();
    const variantId = randomUUID();

    // 1. Setup product and variant
    serverProductRepo.createProduct(tenantCtx, {
      id: productId,
      name: "Paracetamol",
      sku: "PARA-01",
      category: "Pharmacy",
      variants: [
        {
          id: variantId,
          name: "500mg Strip",
          sku: "PARA-500",
          price: 5,
          costPrice: 3,
        },
      ],
    });

    serverStockRepo.recordMovement(tenantCtx, {
      variantId,
      movementType: "PURCHASE_RECEIPT",
      quantityChange: 50,
      idempotencyKey: "INIT-PARA-50",
    });

    const pushReq: SyncPushRequest = {
      clientVersion: "2.12.5",
      deviceId: "dev-01",
      operations: [
        {
          operationId: "OP-ADJ-001",
          entityType: "StockAdjustment",
          entityId: randomUUID(),
          operationType: "CREATE",
          payload: {
            variantId,
            adjustmentType: "INCREASE",
            quantityChange: 25,
            reason: "Restock Delivery",
            deviceId: "dev-01",
            operationId: "OP-ADJ-001",
            idempotencyKey: "KEY-ADJ-001",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-ADJ-001",
        },
      ],
    };

    const res = await syncEngine.processPush(tenantCtx, pushReq);
    expect(res.results[0].status).toBe("SUCCESS");

    // Assert productVariant.inventoryQuantity is updated: 50 + 25 = 75
    const variant = globalInMemoryStore.variants.get(variantId);
    expect(variant?.inventoryQuantity).toBe(75);

    // Assert StockLedger record is created
    const ledgers = serverStockRepo.getLedger(tenantCtx, variantId);
    expect(ledgers.length).toBe(2);
    expect(ledgers[1].quantityChange).toBe(25);

    // Assert parent Product stock is updated
    const product = serverProductRepo.getProductById(tenantCtx, productId);
    expect(product?.totalStock).toBe(75);
    expect(product?.availableStock).toBe(75);
  });

  it("executes atomic UnitConversionTransaction and prevents negative stock when parent is insufficient", async () => {
    const productId = randomUUID();
    const parentVarId = randomUUID(); // Box (contains 10 Pieces)
    const childVarId = randomUUID();  // Piece

    serverProductRepo.createProduct(tenantCtx, {
      id: productId,
      name: "Juice Box",
      sku: "JUICE-PARENT",
      category: "Beverages",
      variants: [
        {
          id: parentVarId,
          name: "Juice Box (Carton)",
          sku: "JUICE-BOX",
          price: 20,
          costPrice: 15,
        },
        {
          id: childVarId,
          name: "Juice Pack (Piece)",
          sku: "JUICE-PIECE",
          price: 2.5,
          costPrice: 1.5,
        },
      ],
    });

    serverStockRepo.recordMovement(tenantCtx, {
      variantId: parentVarId,
      movementType: "PURCHASE_RECEIPT",
      quantityChange: 2,
      idempotencyKey: "INIT-PARENT-2",
    });

    serverStockRepo.recordMovement(tenantCtx, {
      variantId: childVarId,
      movementType: "PURCHASE_RECEIPT",
      quantityChange: 5,
      idempotencyKey: "INIT-CHILD-5",
    });

    // Case 1: Valid conversion (Convert 1 Box -> 10 Pieces)
    const validConversion: SyncPushRequest = {
      clientVersion: "2.12.5",
      deviceId: "dev-terminal-01",
      operations: [
        {
          operationId: "OP-CONV-001",
          entityType: "UnitConversionTransaction" as any,
          entityId: randomUUID(),
          operationType: "CREATE",
          payload: {
            parentVariantId: parentVarId,
            childVariantId: childVarId,
            parentUnitsDeducted: 1,
            childUnitsProduced: 10,
            conversionFactor: 10,
            reason: "Break carton for retail selling",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-CONV-001",
        },
      ],
    };

    const res1 = await syncEngine.processPush(tenantCtx, validConversion);
    expect(res1.results[0].status).toBe("SUCCESS");

    // Parent Box decreased: 2 - 1 = 1
    expect(globalInMemoryStore.variants.get(parentVarId)?.inventoryQuantity).toBe(1);
    // Child Piece increased: 5 + 10 = 15
    expect(globalInMemoryStore.variants.get(childVarId)?.inventoryQuantity).toBe(15);
    // Two paired ledger records (one negative, one positive) plus initial seeding = 2 each
    expect(serverStockRepo.getLedger(tenantCtx, parentVarId).length).toBe(2);
    expect(serverStockRepo.getLedger(tenantCtx, childVarId).length).toBe(2);

    // Case 2: Insufficient parent stock (Try to convert 5 Boxes when only 1 remains)
    const overConversion: SyncPushRequest = {
      clientVersion: "2.12.5",
      deviceId: "dev-terminal-02",
      operations: [
        {
          operationId: "OP-CONV-002",
          entityType: "UnitConversionTransaction" as any,
          entityId: randomUUID(),
          operationType: "CREATE",
          payload: {
            parentVariantId: parentVarId,
            childVariantId: childVarId,
            parentUnitsDeducted: 5, // exceeds available 1
            childUnitsProduced: 50,
            conversionFactor: 10,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-CONV-002",
        },
      ],
    };

    const res2 = await syncEngine.processPush(tenantCtx, overConversion);
    expect(res2.results[0].status).toBe("FAILED");
    expect(res2.results[0].error).toContain("CONVERSION_CONFLICT: INSUFFICIENT_PARENT_STOCK");

    // Verification Metric: No negative or clamped-to-zero inventory without conflict flag
    expect(globalInMemoryStore.variants.get(parentVarId)?.inventoryQuantity).toBe(1); // untouched
  });
});
