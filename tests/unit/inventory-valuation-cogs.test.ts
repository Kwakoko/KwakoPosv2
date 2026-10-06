import { describe, it, expect } from "vitest";
import { InventoryValuationEngine } from "../../packages/domain/src/index.js";
import type { ProductVariant, StockLedger } from "@kwakopos2/contracts";

const variant = (overrides: Partial<ProductVariant> = {}): ProductVariant => ({
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
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...overrides,
});

const ledger = (
  id: string,
  quantityChange: number,
  unitCost: number,
  occurredAt: string,
  variantId = "v1",
): StockLedger => ({
  id,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: null,
  productId: "p1",
  variantId,
  movementType: quantityChange >= 0 ? "PURCHASE_RECEIVE" : "SALE",
  referenceType: "TEST",
  referenceId: null,
  quantityBefore: 0,
  quantityChange,
  quantity: Math.abs(quantityChange),
  quantityAfter: Math.max(0, quantityChange),
  unitCost,
  totalCost: Math.abs(quantityChange) * unitCost,
  userId: null,
  deviceId: "d",
  operationId: id,
  idempotencyKey: id,
  notes: null,
  synced: true,
  occurredAt,
  createdAt: occurredAt,
});

describe("KwakoPos Inventory Valuation & COGS Engine Tests", () => {
  it("calculates weighted average unit cost across multiple receipts", () => {
    const wac = InventoryValuationEngine.calculateWeightedAverageCost(variant(), [
      { quantityReceived: 100, unitCost: 2500 },
      { quantityReceived: 200, unitCost: 2800 },
    ]);
    expect(wac).toBe(2700);
  });

  it("uses moving weighted average after an issue and later receipt", () => {
    const ledgers = [
      ledger("1", 100, 2000, "2026-01-01T00:00:00.000Z"),
      ledger("2", -80, 2000, "2026-01-02T00:00:00.000Z"),
      ledger("3", 100, 3000, "2026-01-03T00:00:00.000Z"),
    ];

    const result = InventoryValuationEngine.calculateBranchInventoryValuation(
      [variant()],
      ledgers,
    );

    // 20 @ 2,000 remains, then 100 @ 3,000 arrives:
    // 120 units @ 2,833.333... = 340,000.
    expect(result.variantSummaries[0].availableQuantity).toBe(120);
    expect(result.variantSummaries[0].unitCost).toBe(2833.33);
    expect(result.totalValuation).toBe(340000);
  });

  it("values FIFO from remaining cost layers", () => {
    const ledgers = [
      ledger("1", 100, 2000, "2026-01-01T00:00:00.000Z"),
      ledger("2", 100, 3000, "2026-01-02T00:00:00.000Z"),
      ledger("3", -150, 0, "2026-01-03T00:00:00.000Z"),
    ];

    const result = InventoryValuationEngine.calculateBranchInventoryValuation(
      [variant()],
      ledgers,
      "FIFO",
    );

    expect(result.variantSummaries[0].availableQuantity).toBe(50);
    expect(result.totalValuation).toBe(150000);
  });

  it("supports standard cost explicitly", () => {
    const ledgers = [
      ledger("1", 100, 2000, "2026-01-01T00:00:00.000Z"),
      ledger("2", -25, 2000, "2026-01-02T00:00:00.000Z"),
    ];

    const result = InventoryValuationEngine.calculateBranchInventoryValuation(
      [variant({ costPrice: 2500 })],
      ledgers,
      "STANDARD_COST",
    );

    expect(result.variantSummaries[0].availableQuantity).toBe(75);
    expect(result.variantSummaries[0].unitCost).toBe(2500);
    expect(result.totalValuation).toBe(187500);
  });

  it("never uses selling price as inventory carrying cost", () => {
    const result = InventoryValuationEngine.calculateBranchInventoryValuation(
      [variant({ price: 9999, costPrice: 2000 })],
      [ledger("1", 10, 2000, "2026-01-01T00:00:00.000Z")],
    );

    expect(result.totalValuation).toBe(20000);
    expect(result.variantSummaries[0].unitCost).toBe(2000);
  });

  it("clamps oversold stock to zero valuation", () => {
    const result = InventoryValuationEngine.calculateBranchInventoryValuation(
      [variant()],
      [
        ledger("1", 10, 2000, "2026-01-01T00:00:00.000Z"),
        ledger("2", -25, 2000, "2026-01-02T00:00:00.000Z"),
      ],
    );

    expect(result.variantSummaries[0].availableQuantity).toBe(0);
    expect(result.totalValuation).toBe(0);
  });

  it("calculates branch inventory valuation across variants", () => {
    const variants = [
      variant({
        id: "v1",
        productId: "p1",
        name: "Rice 1kg",
        sku: "RICE-1",
        costPrice: 2000,
      }),
      variant({
        id: "v2",
        productId: "p2",
        name: "Flour 1kg",
        sku: "FLR-1",
        costPrice: 1500,
      }),
    ];

    const ledgers = [
      ledger("1", 50, 2000, "2026-01-01T00:00:00.000Z", "v1"),
      ledger("2", 40, 1500, "2026-01-01T00:00:00.000Z", "v2"),
    ];

    const result = InventoryValuationEngine.calculateBranchInventoryValuation(
      variants,
      ledgers,
    );

    expect(result.totalValuation).toBe(160000);
    expect(result.variantSummaries).toHaveLength(2);
    expect(result.variantSummaries[0].totalValuation).toBe(100000);
    expect(result.variantSummaries[1].totalValuation).toBe(60000);
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
