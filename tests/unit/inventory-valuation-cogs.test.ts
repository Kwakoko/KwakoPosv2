import { describe, it, expect } from "vitest";
import { InventoryValuationEngine } from "../../packages/domain/src/index.js";
import type { ProductVariant, StockLedger } from "@kwakopos2/contracts";

describe("KwakoPos Inventory Valuation & COGS Engine Tests", () => {
  it("calculates weighted average unit cost across multiple receipts", () => {
    const variant: ProductVariant = {
      id: "v1",
      tenantId: "t1",
      branchId: "b1",
      productId: "p1",
      name: "Sugar 1kg",
      sku: "SUG-1KG",
      barcode: null,
      price: 3500,
      costPrice: 2800,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Receipt 1: 100 units @ 2,500 = 250,000
    // Receipt 2: 200 units @ 2,800 = 560,000
    // Total = 810,000 / 300 units = 2,700 WAC
    const receipts = [
      { quantityReceived: 100, unitCost: 2500 },
      { quantityReceived: 200, unitCost: 2800 },
    ];

    const wac = InventoryValuationEngine.calculateWeightedAverageCost(variant, receipts);
    expect(wac).toBe(2700);
  });

  it("calculates branch inventory valuation from ledger balances", () => {
    const variants: ProductVariant[] = [
      { id: "v1", tenantId: "t1", branchId: "b1", productId: "p1", name: "Rice 1kg", sku: "RICE-1", barcode: null, price: 3000, costPrice: 2000, isActive: true, createdAt: "", updatedAt: "" },
      { id: "v2", tenantId: "t1", branchId: "b1", productId: "p2", name: "Flour 1kg", sku: "FLR-1", barcode: null, price: 2000, costPrice: 1500, isActive: true, createdAt: "", updatedAt: "" },
    ];

    const ledgers: StockLedger[] = [
      { id: "1", tenantId: "t1", branchId: "b1", productId: "p1", variantId: "v1", movementType: "PURCHASE_RECEIVE", quantity: 50, unitCost: 2000, referenceType: "REC", referenceId: null, occurredAt: "", deviceId: "d", operationId: "o", idempotencyKey: "k1", createdAt: "" },
      { id: "2", tenantId: "t1", branchId: "b1", productId: "p2", variantId: "v2", movementType: "PURCHASE_RECEIVE", quantity: 40, unitCost: 1500, referenceType: "REC", referenceId: null, occurredAt: "", deviceId: "d", operationId: "o", idempotencyKey: "k2", createdAt: "" },
    ];

    // Valuation: (50 * 2000) + (40 * 1500) = 100,000 + 60,000 = 160,000
    const { totalValuation, variantSummaries } = InventoryValuationEngine.calculateBranchInventoryValuation(variants, ledgers);

    expect(totalValuation).toBe(160000);
    expect(variantSummaries.length).toBe(2);
    expect(variantSummaries[0].totalValuation).toBe(100000);
    expect(variantSummaries[1].totalValuation).toBe(60000);
  });

  it("uses perpetual WAC from receipt costs instead of mutable variant costPrice", () => {
    const variant: ProductVariant = { id: "v1", tenantId: "t1", branchId: "b1", productId: "p1", name: "Oil", sku: "OIL-1", barcode: null, price: 5000, costPrice: 1000, isActive: true, createdAt: "", updatedAt: "" };
    const ledgers: StockLedger[] = [
      { id: "r1", tenantId: "t1", branchId: "b1", productId: "p1", variantId: "v1", movementType: "PURCHASE_RECEIVE", quantity: 100, unitCost: 2000, referenceType: "REC", referenceId: null, occurredAt: "2026-01-01T00:00:00Z", deviceId: "d", operationId: "o1", idempotencyKey: "wac-1", createdAt: "2026-01-01T00:00:00Z" },
      { id: "s1", tenantId: "t1", branchId: "b1", productId: "p1", variantId: "v1", movementType: "SALE", quantity: 20, unitCost: 2000, referenceType: "SALE", referenceId: null, occurredAt: "2026-01-02T00:00:00Z", deviceId: "d", operationId: "o2", idempotencyKey: "wac-2", createdAt: "2026-01-02T00:00:00Z" },
      { id: "r2", tenantId: "t1", branchId: "b1", productId: "p1", variantId: "v1", movementType: "PURCHASE_RECEIVE", quantity: 80, unitCost: 3000, referenceType: "REC", referenceId: null, occurredAt: "2026-01-03T00:00:00Z", deviceId: "d", operationId: "o3", idempotencyKey: "wac-3", createdAt: "2026-01-03T00:00:00Z" },
    ];
    const result = InventoryValuationEngine.calculateBranchInventoryValuation([variant], ledgers);
    expect(result.variantSummaries[0].availableQuantity).toBe(160);
    expect(result.variantSummaries[0].unitCost).toBe(2500);
    expect(result.variantSummaries[0].totalValuation).toBe(400000);
  });

  it("reconciles physical inventory valuation with GL Account 1410 balance", () => {
    const matched = InventoryValuationEngine.reconcileStockToGeneralLedger(160000, 160000);
    expect(matched.isReconciled).toBe(true);
    expect(matched.variance).toBe(0);

    const mismatched = InventoryValuationEngine.reconcileStockToGeneralLedger(165000, 160000);
    expect(mismatched.isReconciled).toBe(false);
    expect(mismatched.variance).toBe(5000);
  });
});
