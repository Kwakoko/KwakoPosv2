import { describe, it, expect } from "vitest";
import { reconcileInventoryLedger } from "../../scripts/ops/reconcile-data.js";
import { assertInventoryLedgerIntegrity, assertNoOrphanAdjustments } from "@kwakopos2/domain";
import type { ProductVariant, StockAdjustment, StockLedger } from "@kwakopos2/contracts";

describe("Data Reconciliation & Invariants 010 / 011", () => {
  const variant: ProductVariant = {
    id: "var-rec-01",
    tenantId: "tenant-rec-01",
    branchId: "branch-rec-01",
    productId: "prod-rec-01",
    name: "500ml Bottled Juice",
    sku: "JUICE-500",
    barcode: null,
    price: 3.5,
    costPrice: 1.5,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adj1: StockAdjustment = {
    id: "adj-rec-01",
    tenantId: "tenant-rec-01",
    branchId: "branch-rec-01",
    variantId: "var-rec-01",
    adjustmentType: "INCREASE",
    quantityChange: 200,
    reason: "Opening Stock",
    referenceNote: null,
    status: "COMPLETED",
    createdByUserId: "user-01",
    deviceId: "device-01",
    operationId: "op-01",
    idempotencyKey: "idem-01",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ledger1: StockLedger = {
    id: "led-rec-01",
    tenantId: "tenant-rec-01",
    branchId: "branch-rec-01",
    productId: "prod-rec-01",
    variantId: "var-rec-01",
    movementType: "ADJUSTMENT",
    quantity: 200,
    referenceType: "StockAdjustment",
    referenceId: "adj-rec-01",
    occurredAt: new Date().toISOString(),
    deviceId: "device-01",
    operationId: "op-01",
    idempotencyKey: "idem-01",
    createdAt: new Date().toISOString(),
  };

  const adj2: StockAdjustment = {
    id: "adj-rec-02",
    tenantId: "tenant-rec-01",
    branchId: "branch-rec-01",
    variantId: "var-rec-01",
    adjustmentType: "DECREASE",
    quantityChange: -12,
    reason: "Transit Breakage",
    referenceNote: null,
    status: "COMPLETED",
    createdByUserId: "user-01",
    deviceId: "device-01",
    operationId: "op-02",
    idempotencyKey: "idem-02",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ledger2: StockLedger = {
    id: "led-rec-02",
    tenantId: "tenant-rec-01",
    branchId: "branch-rec-01",
    productId: "prod-rec-01",
    variantId: "var-rec-01",
    movementType: "ADJUSTMENT",
    quantity: -12,
    referenceType: "StockAdjustment",
    referenceId: "adj-rec-02",
    occurredAt: new Date().toISOString(),
    deviceId: "device-01",
    operationId: "op-02",
    idempotencyKey: "idem-02",
    createdAt: new Date().toISOString(),
  };

  it("produces a CLEAN report when inventory and adjustments are consistent (200 - 12 = 188)", () => {
    const reportedStockMap = new Map([["var-rec-01", 188]]);
    const report = reconcileInventoryLedger(
      [variant],
      [adj1, adj2],
      [ledger1, ledger2],
      reportedStockMap
    );

    expect(report.status).toBe("CLEAN");
    expect(report.discrepanciesFound).toHaveLength(0);
    expect(report.orphanedAdjustments).toHaveLength(0);
    expect(() => assertInventoryLedgerIntegrity("var-rec-01", 188, [ledger1, ledger2])).not.toThrow();
    expect(() => assertNoOrphanAdjustments([adj1, adj2], [ledger1, ledger2])).not.toThrow();
  });

  it("detects stock discrepancy when reported stock deviates from ledger sum", () => {
    const corruptedReportedStockMap = new Map([["var-rec-01", 195]]);
    const report = reconcileInventoryLedger(
      [variant],
      [adj1, adj2],
      [ledger1, ledger2],
      corruptedReportedStockMap
    );

    expect(report.status).toBe("ANOMALIES_DETECTED");
    expect(report.discrepanciesFound).toHaveLength(1);
    expect(report.discrepanciesFound[0].delta).toBe(7); // 195 - 188 = 7
    expect(() => assertInventoryLedgerIntegrity("var-rec-01", 195, [ledger1, ledger2])).toThrow(
      /INVARIANT_010_VIOLATION/
    );
  });

  it("detects orphaned adjustments that lack a corresponding ledger movement", () => {
    const orphanAdj: StockAdjustment = {
      ...adj1,
      id: "adj-orphan-99",
      idempotencyKey: "idem-orphan-99",
    };

    const report = reconcileInventoryLedger(
      [variant],
      [adj1, adj2, orphanAdj],
      [ledger1, ledger2],
      new Map([["var-rec-01", 188]])
    );

    expect(report.status).toBe("ANOMALIES_DETECTED");
    expect(report.orphanedAdjustments).toContain("adj-orphan-99");
    expect(() => assertNoOrphanAdjustments([adj1, adj2, orphanAdj], [ledger1, ledger2])).toThrow(
      /INVARIANT_011_VIOLATION/
    );
  });
});