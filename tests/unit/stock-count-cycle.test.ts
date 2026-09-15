import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext } from "@kwakopos2/contracts";
import { StockCountEngine } from "@kwakopos2/domain";

describe("H-013: StockCountEngine Cycle Count & Reconciliation Suite", () => {
  let engine: StockCountEngine;
  const ctxA: TenantContext = {
    tenantId: "TENANT_RETAIL_1",
    branchId: "BRANCH_MAIN",
    userId: "USER_AUDITOR",
    roles: ["STOCK_AUDITOR"],
    permissions: ["INVENTORY_VIEW", "INVENTORY_COUNT", "INVENTORY_ADJUST"],
  };
  const ctxB: TenantContext = {
    tenantId: "TENANT_RETAIL_2",
    branchId: "BRANCH_MAIN",
    userId: "USER_B",
    roles: ["STOCK_AUDITOR"],
    permissions: ["INVENTORY_VIEW", "INVENTORY_COUNT"],
  };

  beforeEach(() => {
    StockCountEngine.resetInstance();
    engine = StockCountEngine.getInstance();
  });

  it("should create a cycle count session with system stock snapshot", () => {
    const baseline = [
      { productId: "P1", variantId: "V1", sku: "SKU-BEVERAGE-01", productName: "Soda 500ml", systemQuantity: 100, unitCost: 1000 },
      { productId: "P2", variantId: "V2", sku: "SKU-SNACK-01", productName: "Crisps 100g", systemQuantity: 50, unitCost: 1500 },
    ];

    const session = engine.startSession(
      ctxA,
      {
        name: "Weekly Snack Cycle Count",
        scope: "CATEGORY",
        notes: "Count before weekend rush",
      },
      baseline
    );

    expect(session.id).toBeDefined();
    expect(session.status).toBe("COUNTING");
    expect(session.sessionNumber).toMatch(/^COUNT-/);
    expect(session.lines.length).toBe(2);
    expect(session.lines[0].countedQuantity).toBeNull();
    expect(session.lines[0].varianceQuantity).toBe(0);
  });

  it("should accurately track count entries and calculate discrepancies", () => {
    const baseline = [
      { productId: "P1", variantId: "V1", sku: "SKU-BEVERAGE-01", productName: "Soda 500ml", systemQuantity: 100, unitCost: 1000 },
      { productId: "P2", variantId: "V2", sku: "SKU-SNACK-01", productName: "Crisps 100g", systemQuantity: 50, unitCost: 1500 },
    ];

    const session = engine.startSession(ctxA, { name: "Audit 01", scope: "FULL_STORE" }, baseline);

    // Count line 1: counted 95 (5 missing -> variance -5)
    engine.recordCount(ctxA, session.id, { variantId: "V1", countedQuantity: 95 });

    // Count line 2: counted 52 (2 extra -> variance +2)
    const updated = engine.recordCount(ctxA, session.id, { variantId: "V2", countedQuantity: 52 });

    expect(updated.totalItemsCounted).toBe(2);
    expect(updated.totalDiscrepantItems).toBe(2);
    expect(updated.netVarianceQuantity).toBe(-3); // -5 + 2 = -3
    // Variance value: (-5 * 1000) + (2 * 1500) = -5000 + 3000 = -2000
    expect(updated.netVarianceValue).toBe(-2000);
  });

  it("should reconcile session and produce compensating adjustments", () => {
    const baseline = [
      { productId: "P1", variantId: "V1", sku: "SKU-BEVERAGE-01", productName: "Soda 500ml", systemQuantity: 100, unitCost: 1000 },
      { productId: "P2", variantId: "V2", sku: "SKU-SNACK-01", productName: "Crisps 100g", systemQuantity: 50, unitCost: 1500 },
    ];

    const session = engine.startSession(ctxA, { name: "Audit 02", scope: "FULL_STORE" }, baseline);
    engine.recordCount(ctxA, session.id, { variantId: "V1", countedQuantity: 98 }); // -2
    engine.recordCount(ctxA, session.id, { variantId: "V2", countedQuantity: 50 }); // balanced (0)

    const { session: reconciled, adjustmentsToPost } = engine.reconcileSession(ctxA, session.id, {
      autoAdjustLedger: true,
      adjustmentReason: "End of month physical count",
    });

    expect(reconciled.status).toBe("RECONCILING");
    expect(adjustmentsToPost.length).toBe(1); // Only V1 had variance
    expect(adjustmentsToPost[0].variantId).toBe("V1");
    expect(adjustmentsToPost[0].quantityChange).toBe(-2);

    // Finalize
    const finalized = engine.finalizeSession(ctxA, session.id);
    expect(finalized.status).toBe("POSTED");
    expect(finalized.approvedById).toBe(ctxA.userId);
  });

  it("should enforce tenant isolation on count sessions", () => {
    const baseline = [{ productId: "P1", variantId: "V1", sku: "SKU-01", productName: "Item", systemQuantity: 10, unitCost: 100 }];
    const sessionA = engine.startSession(ctxA, { name: "Tenant A Audit", scope: "FULL_STORE" }, baseline);

    // Tenant B cannot access or record count in Tenant A session
    expect(() => engine.getSession(ctxB, sessionA.id)).toThrowError("TENANT_BOUNDARY_VIOLATION");
    expect(() => engine.recordCount(ctxB, sessionA.id, { variantId: "V1", countedQuantity: 10 })).toThrowError(
      "TENANT_BOUNDARY_VIOLATION"
    );
  });
});
