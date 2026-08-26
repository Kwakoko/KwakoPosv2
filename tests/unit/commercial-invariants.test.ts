import { describe, it, expect } from "vitest";
import {
  assertSaleLinesValid,
  assertSaleLineVariantsValid,
  assertStockAffectingSaleHasLedger,
  assertPurchaseReceiptHasInventory,
  assertPaymentTransactionValid,
  assertReturnReferencesOriginalSale,
  assertFinancialTransactionTenantIsolation,
  assertIdempotencyUniqueness,
  assertInventoryMathematicalReconciliation,
  assertMultiDeviceAuthoritativeConvergence,
  calculateAvailableStock,
} from "../../packages/domain/src/index.js";
import type { SaleLine, StockLedger, TenantContext } from "@kwakopos2/contracts";

describe("KwakoPos Commercial Core Invariants C001 - C010", () => {
  const dummyCtx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  it("INVARIANT C001: Rejects finalized sale with 0 sale lines", () => {
    expect(() => assertSaleLinesValid({ id: "sale-1" }, [])).toThrow(/INVARIANT_C001_VIOLATION/);
  });

  it("INVARIANT C002: Rejects sale line with invalid or non-existent variantId", () => {
    const validVariants = new Set(["var-1", "var-2"]);
    const lines: SaleLine[] = [
      {
        id: "line-1",
        saleId: "sale-1",
        productId: "prod-1",
        variantId: "invalid-var",
        quantity: 2,
        unitPrice: 1000,
        unitCost: 500,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: 2000,
      },
    ];
    expect(() => assertSaleLineVariantsValid(lines, validVariants)).toThrow(/INVARIANT_C002_VIOLATION/);
  });

  it("INVARIANT C003: Ensures every stock-affecting sale has matching StockLedger deduction", () => {
    const lines: SaleLine[] = [
      {
        id: "line-1",
        saleId: "sale-100",
        productId: "prod-1",
        variantId: "var-1",
        quantity: 5,
        unitPrice: 1000,
        unitCost: 500,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: 5000,
      },
    ];

    const ledgers: StockLedger[] = [
      {
        id: "led-1",
        tenantId: dummyCtx.tenantId,
        branchId: dummyCtx.branchId,
        productId: "prod-1",
        variantId: "var-1",
        movementType: "SALE",
        quantity: -5,
        referenceType: "SALE",
        referenceId: "sale-100",
        occurredAt: new Date().toISOString(),
        deviceId: "dev-1",
        operationId: "op-1",
        idempotencyKey: "idem-1",
        createdAt: new Date().toISOString(),
      },
    ];

    expect(() => assertStockAffectingSaleHasLedger("sale-100", lines, ledgers)).not.toThrow();

    // Partial or missing deduction throws
    expect(() => assertStockAffectingSaleHasLedger("sale-100", lines, [])).toThrow(/INVARIANT_C003_VIOLATION/);
  });

  it("INVARIANT C004: Ensures goods receipt produces matching StockLedger additions", () => {
    const items = [{ variantId: "var-1", quantityReceived: 20 }];
    const ledgers: StockLedger[] = [
      {
        id: "led-2",
        tenantId: dummyCtx.tenantId,
        branchId: dummyCtx.branchId,
        productId: "prod-1",
        variantId: "var-1",
        movementType: "PURCHASE",
        quantity: 20,
        referenceType: "PURCHASE_RECEIPT",
        referenceId: "rec-100",
        occurredAt: new Date().toISOString(),
        deviceId: "dev-1",
        operationId: "op-2",
        idempotencyKey: "idem-2",
        createdAt: new Date().toISOString(),
      },
    ];

    expect(() => assertPurchaseReceiptHasInventory("rec-100", items, ledgers)).not.toThrow();
    expect(() => assertPurchaseReceiptHasInventory("rec-100", items, [])).toThrow(/INVARIANT_C004_VIOLATION/);
  });

  it("INVARIANT C005: Rejects unallocated or non-positive payment", () => {
    expect(() => assertPaymentTransactionValid({ amount: -100, saleId: "sale-1" })).toThrow(/INVARIANT_C005_VIOLATION/);
    expect(() => assertPaymentTransactionValid({ amount: 1000 })).toThrow(/INVARIANT_C005_VIOLATION/);
  });

  it("INVARIANT C006: Rejects returns referencing non-existent original sale", () => {
    expect(() => assertReturnReferencesOriginalSale({ originalSaleId: "non-existent-sale" }, false)).toThrow(/INVARIANT_C006_VIOLATION/);
    expect(() => assertReturnReferencesOriginalSale({ originalSaleId: "valid-sale" }, true)).not.toThrow();
  });

  it("INVARIANT C007: Enforces strict tenant isolation for financial transactions", () => {
    expect(() =>
      assertFinancialTransactionTenantIsolation(dummyCtx, {
        tenantId: "99999999-9999-9999-9999-999999999999",
      })
    ).toThrow(/INVARIANT_C007_VIOLATION/);
  });

  it("INVARIANT C008: Enforces idempotency key uniqueness", () => {
    const existing = new Set(["OP-KEY-1", "OP-KEY-2"]);
    expect(() => assertIdempotencyUniqueness("OP-KEY-1", existing)).toThrow(/INVARIANT_C008_VIOLATION/);
    expect(() => assertIdempotencyUniqueness("OP-KEY-3", existing)).not.toThrow();
  });

  it("INVARIANT C009: Mathematical inventory reconciliation (Available = Sum of Ledgers)", () => {
    const ledgers: StockLedger[] = [
      { id: "1", tenantId: dummyCtx.tenantId, branchId: dummyCtx.branchId, productId: "p1", variantId: "v1", movementType: "OPENING", quantity: 100, referenceType: "INIT", referenceId: null, occurredAt: new Date().toISOString(), deviceId: "d", operationId: "o", idempotencyKey: "k1", createdAt: new Date().toISOString() },
      { id: "2", tenantId: dummyCtx.tenantId, branchId: dummyCtx.branchId, productId: "p1", variantId: "v1", movementType: "SALE", quantity: -15, referenceType: "SALE", referenceId: null, occurredAt: new Date().toISOString(), deviceId: "d", operationId: "o", idempotencyKey: "k2", createdAt: new Date().toISOString() },
    ];
    expect(calculateAvailableStock(ledgers)).toBe(85);
    expect(() => assertInventoryMathematicalReconciliation("v1", 85, ledgers)).not.toThrow();
    expect(() => assertInventoryMathematicalReconciliation("v1", 90, ledgers)).toThrow(/INVARIANT_C009_VIOLATION/);
  });

  it("INVARIANT C010: Multi-device state converges to identical server balance", () => {
    expect(() => assertMultiDeviceAuthoritativeConvergence(85, 85, 85)).not.toThrow();
    expect(() => assertMultiDeviceAuthoritativeConvergence(85, 90, 85)).toThrow(/INVARIANT_C010_VIOLATION/);
  });
});