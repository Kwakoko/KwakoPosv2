import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext } from "@kwakopos2/contracts";
import { InventoryBatchEngine } from "@kwakopos2/domain";

describe("H-012: InventoryBatchEngine & FEFO Allocation Suite", () => {
  let engine: InventoryBatchEngine;
  const ctxA: TenantContext = {
    tenantId: "TENANT_A",
    branchId: "BRANCH_A1",
    userId: "USER_A1",
    roles: ["INVENTORY_MANAGER"],
    permissions: ["INVENTORY_VIEW", "INVENTORY_ADJUST"],
  };
  const ctxB: TenantContext = {
    tenantId: "TENANT_B",
    branchId: "BRANCH_B1",
    userId: "USER_B1",
    roles: ["INVENTORY_MANAGER"],
    permissions: ["INVENTORY_VIEW", "INVENTORY_ADJUST"],
  };

  beforeEach(() => {
    InventoryBatchEngine.resetInstance();
    engine = InventoryBatchEngine.getInstance();
  });

  it("should register valid batches and reject expired batches", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const batch = engine.registerBatch(ctxA, {
      productId: "PROD_PARACETAMOL",
      variantId: "VAR_500MG",
      batchNumber: "B2026-001",
      expiryDate: tomorrow,
      quantity: 100,
      unitCost: 150,
    });

    expect(batch.id).toBeDefined();
    expect(batch.batchNumber).toBe("B2026-001");
    expect(batch.quantityRemaining).toBe(100);
    expect(batch.status).toBe("ACTIVE");

    // Rejection on past date
    expect(() =>
      engine.registerBatch(ctxA, {
        productId: "PROD_PARACETAMOL",
        variantId: "VAR_500MG",
        batchNumber: "B2025-EXPIRED",
        expiryDate: yesterday,
        quantity: 50,
        unitCost: 150,
      })
    ).toThrowError("INVALID_BATCH_EXPIRY");
  });

  it("should allocate stock in strict First-Expired-First-Out (FEFO) order", () => {
    const date1 = new Date(Date.now() + 10 * 86400000).toISOString(); // expires in 10 days
    const date2 = new Date(Date.now() + 30 * 86400000).toISOString(); // expires in 30 days
    const date3 = new Date(Date.now() + 60 * 86400000).toISOString(); // expires in 60 days

    // Register out of order
    engine.registerBatch(ctxA, {
      productId: "PROD_AMOXICILLIN",
      variantId: "VAR_AMOX_250",
      batchNumber: "BATCH_LATE",
      expiryDate: date3,
      quantity: 100,
      unitCost: 200,
    });

    engine.registerBatch(ctxA, {
      productId: "PROD_AMOXICILLIN",
      variantId: "VAR_AMOX_250",
      batchNumber: "BATCH_EARLY",
      expiryDate: date1,
      quantity: 40,
      unitCost: 180,
    });

    engine.registerBatch(ctxA, {
      productId: "PROD_AMOXICILLIN",
      variantId: "VAR_AMOX_250",
      batchNumber: "BATCH_MID",
      expiryDate: date2,
      quantity: 50,
      unitCost: 190,
    });

    // Request 70 units: should take 40 from BATCH_EARLY, then 30 from BATCH_MID
    const result = engine.allocateFefo(ctxA, {
      variantId: "VAR_AMOX_250",
      quantityRequested: 70,
      referenceType: "SALE",
      referenceId: "SALE_1001",
    });

    expect(result.isFullyFulfilled).toBe(true);
    expect(result.totalAllocated).toBe(70);
    expect(result.allocations.length).toBe(2);

    expect(result.allocations[0].batchNumber).toBe("BATCH_EARLY");
    expect(result.allocations[0].allocatedQuantity).toBe(40);

    expect(result.allocations[1].batchNumber).toBe("BATCH_MID");
    expect(result.allocations[1].allocatedQuantity).toBe(30);

    // Remaining in BATCH_MID should now be 20
    const activeMid = engine.getActiveBatchesFefo(ctxA, "VAR_AMOX_250").find((b) => b.batchNumber === "BATCH_MID");
    expect(activeMid?.quantityRemaining).toBe(20);

    // BATCH_EARLY should be DEPLETED
    const activeEarly = engine.getActiveBatchesFefo(ctxA, "VAR_AMOX_250").find((b) => b.batchNumber === "BATCH_EARLY");
    expect(activeEarly).toBeUndefined(); // Depleted batches are filtered out of active
  });

  it("should enforce strict tenant boundary isolation", () => {
    const futureDate = new Date(Date.now() + 20 * 86400000).toISOString();

    const batchA = engine.registerBatch(ctxA, {
      productId: "PROD_INSULIN",
      variantId: "VAR_INSULIN_100",
      batchNumber: "INS-A-01",
      expiryDate: futureDate,
      quantity: 50,
      unitCost: 500,
    });

    // Tenant B cannot access Tenant A's batch
    expect(() => engine.getBatchById(ctxB, batchA.id)).toThrowError("TENANT_BOUNDARY_VIOLATION");
    expect(engine.getActiveBatchesFefo(ctxB, "VAR_INSULIN_100")).toEqual([]);
  });

  it("should generate expiring alerts for batches nearing expiry", () => {
    const in15Days = new Date(Date.now() + 15 * 86400000).toISOString();
    const in90Days = new Date(Date.now() + 90 * 86400000).toISOString();

    engine.registerBatch(ctxA, {
      productId: "PROD_VACCINE",
      variantId: "VAR_VAC_01",
      batchNumber: "VAC-EXP-SOON",
      expiryDate: in15Days,
      quantity: 25,
      unitCost: 1000,
    });

    engine.registerBatch(ctxA, {
      productId: "PROD_VACCINE",
      variantId: "VAR_VAC_02",
      batchNumber: "VAC-EXP-LATER",
      expiryDate: in90Days,
      quantity: 100,
      unitCost: 1000,
    });

    const alerts = engine.getExpiringAlerts(ctxA, { thresholdDays: 30 });
    expect(alerts.length).toBe(1);
    expect(alerts[0].batchNumber).toBe("VAC-EXP-SOON");
    expect(alerts[0].riskLevel).toBe("EXPIRING_SOON");
    expect(alerts[0].daysUntilExpiry).toBeLessThanOrEqual(16);
  });
});
