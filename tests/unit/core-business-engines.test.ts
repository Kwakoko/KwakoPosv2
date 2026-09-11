/**
 * Core Business Engines Unit Test Suite
 * ======================================
 * Tests all 7 Core Business Engines for correctness, invariant protection,
 * tenant isolation, and integration correctness.
 *
 * Engines tested:
 *   - StockLedgerEngine      (balance invariants, INSUFFICIENT_STOCK guard)
 *   - ProductCatalogEngine   (SKU uniqueness, margin calculation, isolation)
 *   - PartyContactEngine     (credit limit, email uniqueness, tenant isolation)
 *   - UniversalPaymentEngine (single payment, split payment)
 *   - SalesProcessingEngine  (sale creation, void)
 *   - PosCheckoutEngine      (atomic end-to-end checkout)
 *   - InventoryEngine        (batch registration, stock reservations)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  StockLedgerEngine,
  ProductCatalogEngine,
  PartyContactEngine,
  UniversalPaymentEngine,
  SalesProcessingEngine,
  PosCheckoutEngine,
  InventoryEngine,
} from "@kwakopos2/domain";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TENANT_A = "tenant-aaaaaaaa-0000-0000-0000-000000000001";
const TENANT_B = "tenant-bbbbbbbb-0000-0000-0000-000000000002";
const BRANCH_A = "branch-aaaaaaaa-0000-0000-0000-000000000001";
const BRANCH_B = "branch-bbbbbbbb-0000-0000-0000-000000000002";
const PRODUCT_1 = "product-11111111-0000-0000-0000-000000000001";
const USER_1 = "user-11111111-0000-0000-0000-000000000001";

function makeCtx(tenantId = TENANT_A, branchId = BRANCH_A): TenantContext {
  return {
    tenantId,
    branchId,
    userId: USER_1,
    roles: ["CASHIER"],
  } as TenantContext;
}

// Reset all engine singletons before each test to ensure clean state
beforeEach(() => {
  StockLedgerEngine.resetInstance();
  ProductCatalogEngine.resetInstance();
  PartyContactEngine.resetInstance();
  UniversalPaymentEngine.resetInstance();
  SalesProcessingEngine.resetInstance();
  PosCheckoutEngine.resetInstance();
  InventoryEngine.resetInstance();
});

// ===========================================================================
// 1. StockLedgerEngine
// ===========================================================================

describe("StockLedgerEngine", () => {
  const ctx = makeCtx();

  it("records a PURCHASE_RECEIPT and returns a positive running balance", () => {
    const ledger = StockLedgerEngine.getInstance();
    const record = ledger.recordMovement(ctx, {
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      movementType: "PURCHASE_RECEIPT",
      productId: PRODUCT_1,
      variantId: null,
      batchId: null,
      batchNumber: null,
      quantityDelta: 100,
      unitCost: 500,
      referenceType: "PURCHASE",
      referenceId: "po-001",
      actorId: USER_1,
    });

    expect(record.id).toBeTruthy();
    expect(record.runningBalanceAfter).toBe(100);

    const balance = ledger.getBalance(ctx, TENANT_A, BRANCH_A, PRODUCT_1, null);
    expect(balance).toBe(100);
  });

  it("records a SALE decrement and reduces the running balance", () => {
    const ledger = StockLedgerEngine.getInstance();
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 50, unitCost: 1000, referenceType: "PURCHASE",
      referenceId: "po-002", actorId: USER_1,
    });

    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "SALE",
      productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: -10, unitCost: 1000, referenceType: "SALE",
      referenceId: "sale-001", actorId: USER_1,
    });

    expect(ledger.getBalance(ctx, TENANT_A, BRANCH_A, PRODUCT_1, null)).toBe(40);
  });

  it("throws INSUFFICIENT_STOCK when balance would go negative (allowNegativeStock=false)", () => {
    const ledger = StockLedgerEngine.getInstance();
    // No stock added — trying to sell from empty
    expect(() =>
      ledger.recordMovement(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A, movementType: "SALE",
        productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
        quantityDelta: -5, unitCost: 1000, referenceType: "SALE",
        referenceId: "sale-002", actorId: USER_1,
        allowNegativeStock: false,
      })
    ).toThrow("INSUFFICIENT_STOCK");
  });

  it("allows negative stock when allowNegativeStock=true", () => {
    const ledger = StockLedgerEngine.getInstance();
    expect(() =>
      ledger.recordMovement(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A, movementType: "ADJUSTMENT_OUT",
        productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
        quantityDelta: -999, unitCost: 0, referenceType: "ADJUSTMENT",
        referenceId: "adj-001", actorId: USER_1,
        allowNegativeStock: true,
      })
    ).not.toThrow();
  });

  it("maintains tenant isolation — TENANT_B sees zero balance for TENANT_A product", () => {
    const ctxB = makeCtx(TENANT_B, BRANCH_B);
    const ledger = StockLedgerEngine.getInstance();
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 200, unitCost: 100, referenceType: "PURCHASE",
      referenceId: "po-003", actorId: USER_1,
    });

    expect(ledger.getBalance(ctxB, TENANT_B, BRANCH_B, PRODUCT_1, null)).toBe(0);
  });

  it("returns movement history (append-only ledger)", () => {
    const ledger = StockLedgerEngine.getInstance();
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 100, unitCost: 100, referenceType: "PURCHASE",
      referenceId: "po-004", actorId: USER_1,
    });
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "SALE",
      productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: -20, unitCost: 100, referenceType: "SALE",
      referenceId: "sale-003", actorId: USER_1,
    });

    const history = ledger.getMovementHistory(ctx, TENANT_A, BRANCH_A, PRODUCT_1);
    expect(history).toHaveLength(2);
    expect(history[0].movementType).toBe("PURCHASE_RECEIPT");
    expect(history[1].movementType).toBe("SALE");
  });

  it("blocks cross-tenant ledger access (TENANT_BOUNDARY_VIOLATION)", () => {
    const ctxA = makeCtx(TENANT_A);
    const ledger = StockLedgerEngine.getInstance();
    expect(() =>
      ledger.getBalance(ctxA, TENANT_B, BRANCH_B, PRODUCT_1, null)
    ).toThrow("TENANT_BOUNDARY_VIOLATION");
  });
});

// ===========================================================================
// 2. ProductCatalogEngine
// ===========================================================================

describe("ProductCatalogEngine", () => {
  const ctx = makeCtx();

  it("creates a product and retrieves it", () => {
    const catalog = ProductCatalogEngine.getInstance();
    const product = catalog.createProduct(ctx, {
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      name: "Paracetamol 500mg",
      sku: "PARA-500",
      buyingPrice: 200,
      sellingPrice: 350,
    });

    expect(product.id).toBeTruthy();
    expect(product.sku).toBe("PARA-500");

    const found = catalog.getProduct(ctx, product.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Paracetamol 500mg");
  });

  it("enforces SKU uniqueness within a tenant", () => {
    const catalog = ProductCatalogEngine.getInstance();
    catalog.createProduct(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A,
      name: "Product A", sku: "SKU-UNIQUE-001",
      buyingPrice: 100, sellingPrice: 200,
    });

    expect(() =>
      catalog.createProduct(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A,
        name: "Product B", sku: "SKU-UNIQUE-001", // duplicate
        buyingPrice: 100, sellingPrice: 200,
      })
    ).toThrow("PRODUCT_SKU_EXISTS");
  });

  it("allows same SKU in different tenants (multi-tenant isolation)", () => {
    const ctxB = makeCtx(TENANT_B, BRANCH_B);
    const catalog = ProductCatalogEngine.getInstance();
    catalog.createProduct(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A,
      name: "Widget", sku: "COMMON-SKU", buyingPrice: 50, sellingPrice: 100,
    });

    expect(() =>
      catalog.createProduct(ctxB, {
        tenantId: TENANT_B, branchId: BRANCH_B,
        name: "Widget", sku: "COMMON-SKU", buyingPrice: 50, sellingPrice: 100,
      })
    ).not.toThrow();
  });

  it("rejects empty product name", () => {
    const catalog = ProductCatalogEngine.getInstance();
    expect(() =>
      catalog.createProduct(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A,
        name: "  ", sku: "SKU-X", buyingPrice: 100, sellingPrice: 200,
      })
    ).toThrow("PRODUCT_NAME_REQUIRED");
  });

  it("calculates margin correctly (buying 800, selling 1000 → margin=200, pct=20%)", () => {
    const catalog = ProductCatalogEngine.getInstance();
    const product = catalog.createProduct(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A,
      name: "Margin Product", sku: "MARGIN-001",
      buyingPrice: 800, sellingPrice: 1000,
    });
    expect(product.currentMarginAmount).toBe(200);
    expect(product.currentMarginPercentage).toBeCloseTo(20, 1);
  });

  it("enforces tenant boundary — cross-tenant product creation rejected", () => {
    const ctxA = makeCtx(TENANT_A);
    const catalog = ProductCatalogEngine.getInstance();
    expect(() =>
      catalog.createProduct(ctxA, {
        tenantId: TENANT_B, branchId: BRANCH_B, // TENANT_A ctx trying TENANT_B
        name: "Cross-tenant", sku: "CROSS-001",
        buyingPrice: 100, sellingPrice: 200,
      })
    ).toThrow("TENANT_BOUNDARY_VIOLATION");
  });
});

// ===========================================================================
// 3. PartyContactEngine
// ===========================================================================

describe("PartyContactEngine", () => {
  const ctx = makeCtx();

  it("creates a CUSTOMER party and retrieves it", () => {
    const engine = PartyContactEngine.getInstance();
    const party = engine.createParty(ctx, {
      tenantId: TENANT_A,
      partyType: "PERSON",
      roles: ["CUSTOMER"],
      name: "John Doe",
      email: "john@test.com",
      phone: "+255712345678",
    });

    expect(party.id).toBeTruthy();
    expect(party.roles).toContain("CUSTOMER");

    const found = engine.getParty(ctx, party.id);
    expect(found?.name).toBe("John Doe");
  });

  it("enforces credit limit — balance cannot exceed creditLimit", () => {
    const engine = PartyContactEngine.getInstance();
    const party = engine.createParty(ctx, {
      tenantId: TENANT_A,
      partyType: "PERSON",
      roles: ["CUSTOMER"],
      name: "Credit Customer",
      creditLimit: 10000,
    });

    // Extend credit up to limit
    engine.adjustCreditBalance(ctx, {
      partyId: party.id,
      tenantId: TENANT_A,
      amountDelta: 10000,
      referenceType: "SALE",
      referenceId: "sale-credit-001",
    });

    // 1 TZS beyond limit should throw
    expect(() =>
      engine.adjustCreditBalance(ctx, {
        partyId: party.id,
        tenantId: TENANT_A,
        amountDelta: 1,
        referenceType: "SALE",
        referenceId: "sale-credit-002",
      })
    ).toThrow(/CREDIT_LIMIT/i);
  });

  it("rejects duplicate email within same tenant", () => {
    const engine = PartyContactEngine.getInstance();
    engine.createParty(ctx, {
      tenantId: TENANT_A, partyType: "PERSON",
      roles: ["CUSTOMER"], name: "Alice",
      email: "alice@test.com",
    });

    expect(() =>
      engine.createParty(ctx, {
        tenantId: TENANT_A, partyType: "PERSON",
        roles: ["CUSTOMER"], name: "Alice Clone",
        email: "alice@test.com",
      })
    ).toThrow("PARTY_EMAIL_EXISTS");
  });

  it("rejects party creation with empty name", () => {
    const engine = PartyContactEngine.getInstance();
    expect(() =>
      engine.createParty(ctx, {
        tenantId: TENANT_A, partyType: "PERSON",
        roles: ["CUSTOMER"], name: "",
      })
    ).toThrow("PARTY_NAME_REQUIRED");
  });

  it("enforces tenant boundary — cross-tenant party creation rejected", () => {
    const ctxA = makeCtx(TENANT_A);
    const engine = PartyContactEngine.getInstance();
    expect(() =>
      engine.createParty(ctxA, {
        tenantId: TENANT_B,
        partyType: "PERSON",
        roles: ["CUSTOMER"],
        name: "Cross-Tenant Party",
      })
    ).toThrow("TENANT_BOUNDARY_VIOLATION");
  });
});

// ===========================================================================
// 4. UniversalPaymentEngine
// ===========================================================================

describe("UniversalPaymentEngine", () => {
  const ctx = makeCtx();

  it("processes a single CASH payment and returns a COMPLETED transaction", () => {
    const engine = UniversalPaymentEngine.getInstance();
    const record = engine.processPayment(ctx, {
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      referenceType: "SALE",
      referenceId: "sale-pay-001",
      method: "CASH",
      amount: 5000,
    });

    expect(record.id).toBeTruthy();
    expect(record.status).toBe("COMPLETED");
    expect(record.amount).toBe(5000);
  });

  it("processes a split payment (CASH + MOBILE_MONEY) and returns all payment records", () => {
    const engine = UniversalPaymentEngine.getInstance();
    const result = engine.processSplitPayment(ctx, {
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      referenceType: "SALE",
      referenceId: "sale-pay-split-001",
      totalRequired: 10000,
      splits: [
        { method: "CASH", amount: 4000 },
        { method: "MOBILE_MONEY", provider: "MPESA", amount: 6000, providerReference: "MPESA-TX-001" },
      ],
    });

    expect(result.payments.length).toBe(2);
    expect(result.totalPaid).toBe(10000);
    expect(result.payments[0].method).toBe("CASH");
    expect(result.payments[1].method).toBe("MOBILE_MONEY");
  });

  it("rejects split payment where splits don't sum to totalRequired", () => {
    const engine = UniversalPaymentEngine.getInstance();
    expect(() =>
      engine.processSplitPayment(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A,
        referenceType: "SALE", referenceId: "sale-split-mismatch",
        totalRequired: 10000,
        splits: [
          { method: "CASH", amount: 3000 }, // only 3000 instead of 10000
        ],
      })
    ).toThrow(/SPLIT_AMOUNT_MISMATCH/i);
  });

  it("rejects payment with zero amount", () => {
    const engine = UniversalPaymentEngine.getInstance();
    expect(() =>
      engine.processPayment(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A,
        referenceType: "SALE", referenceId: "sale-zero",
        method: "CASH", amount: 0,
      })
    ).toThrow("INVALID_PAYMENT_AMOUNT");
  });
});

// ===========================================================================
// 5. SalesProcessingEngine
// ===========================================================================

describe("SalesProcessingEngine", () => {
  const ctx = makeCtx();

  it("creates a sale with correct financial totals", () => {
    const engine = SalesProcessingEngine.getInstance();
    const sale = engine.createSale(ctx, {
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      saleNumber: "SALE-TEST-001",
      lines: [
        {
          productId: PRODUCT_1,
          variantId: null,
          quantity: 3,
          unitPrice: 1000,
          unitCost: 500,
          discountAmount: 0,
          taxAmount: 0,
        },
      ],
    });

    expect(sale.grandTotal).toBe(3000);
    expect(sale.totalCost).toBe(1500);
    expect(sale.grossProfit).toBe(1500);
    expect(sale.status).toBe("COMPLETED");
    expect(sale.lines).toHaveLength(1);
  });

  it("voids a sale and marks status as CANCELLED", () => {
    const engine = SalesProcessingEngine.getInstance();
    const created = engine.createSale(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A,
      saleNumber: "SALE-TEST-VOID",
      lines: [{ productId: PRODUCT_1, variantId: null, quantity: 1, unitPrice: 500 }],
    });

    const voided = engine.voidSale(ctx, TENANT_A, created.id, "Customer changed mind");
    expect(voided.status).toBe("CANCELLED");
  });

  it("cannot void an already-voided sale", () => {
    const engine = SalesProcessingEngine.getInstance();
    const created = engine.createSale(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A,
      saleNumber: "SALE-DOUBLE-VOID",
      lines: [{ productId: PRODUCT_1, variantId: null, quantity: 1, unitPrice: 500 }],
    });

    engine.voidSale(ctx, TENANT_A, created.id, "First void");
    expect(() =>
      engine.voidSale(ctx, TENANT_A, created.id, "Second void attempt")
    ).toThrow("SALE_ALREADY_VOIDED");
  });

  it("rejects sale creation when grand total is zero or negative", () => {
    const engine = SalesProcessingEngine.getInstance();
    expect(() =>
      engine.createSale(ctx, {
        tenantId: TENANT_A,
        branchId: BRANCH_A,
        saleNumber: "SALE-ZERO-TOTAL",
        lines: [
          {
            productId: PRODUCT_1,
            variantId: null,
            quantity: 1,
            unitPrice: 0,
            unitCost: 0,
            discountAmount: 0,
            taxAmount: 0,
          },
        ],
      })
    ).toThrow("EMPTY_OR_ZERO_SALE");
  });
});

// ===========================================================================
// 6. PosCheckoutEngine — end-to-end atomic checkout
// ===========================================================================

describe("PosCheckoutEngine", () => {
  const ctx = makeCtx();

  function seedProduct(catalog: ProductCatalogEngine, ledger: StockLedgerEngine, qty = 100) {
    const product = catalog.createProduct(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A,
      name: "Rice 1kg", sku: `RICE-1KG-${randomUUID().slice(0, 4)}`,
      buyingPrice: 1000, sellingPrice: 2500,
    });

    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A,
      movementType: "PURCHASE_RECEIPT",
      productId: product.id,
      variantId: null, batchId: null, batchNumber: null,
      quantityDelta: qty, unitCost: 1000,
      referenceType: "PURCHASE", referenceId: "po-e2e-001",
      actorId: USER_1,
    });

    return product;
  }

  it("completes a full checkout: cart → stock decrement → payment → sale receipt", () => {
    const catalog = ProductCatalogEngine.getInstance();
    const ledger = StockLedgerEngine.getInstance();
    const checkout = PosCheckoutEngine.getInstance();

    const product = seedProduct(catalog, ledger);

    const result = checkout.processCheckout(ctx, {
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      customerId: null,
      cashSessionId: null,
      items: [{ productId: product.id, variantId: null, quantity: 5 }],
      payment: { method: "CASH", amount: 12500, isSplit: false },
      deviceId: "POS-01",
    });

    expect(result.sale.grandTotal).toBe(12500); // 5 × 2500
    expect(result.paymentIds.length).toBeGreaterThan(0);
    expect(result.stockMovementIds.length).toBeGreaterThan(0);
    expect(result.receipt.linesCount).toBe(1);
    expect(result.receipt.changeGiven).toBe(0);

    // Verify stock was decremented
    const remaining = ledger.getBalance(ctx, TENANT_A, BRANCH_A, product.id, null);
    expect(remaining).toBe(95); // 100 - 5
  });

  it("rejects checkout when stock is insufficient", () => {
    const catalog = ProductCatalogEngine.getInstance();
    const ledger = StockLedgerEngine.getInstance();
    const checkout = PosCheckoutEngine.getInstance();

    const product = seedProduct(catalog, ledger, 10); // only 10 in stock

    expect(() =>
      checkout.processCheckout(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A,
        customerId: null, cashSessionId: null,
        items: [{ productId: product.id, variantId: null, quantity: 9999 }],
        payment: { method: "CASH", amount: 99999999, isSplit: false },
      })
    ).toThrow(/INSUFFICIENT_STOCK/i);
  });

  it("rejects checkout with empty cart", () => {
    const checkout = PosCheckoutEngine.getInstance();
    expect(() =>
      checkout.processCheckout(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A,
        customerId: null, cashSessionId: null,
        items: [],
        payment: { method: "CASH", amount: 0, isSplit: false },
      })
    ).toThrow("EMPTY_CHECKOUT_CART");
  });

  it("rejects checkout when grand total is zero or negative", () => {
    const checkout = PosCheckoutEngine.getInstance();
    const catalog = ProductCatalogEngine.getInstance();
    const ledger = StockLedgerEngine.getInstance();
    const product = seedProduct(catalog, ledger, 10);
    expect(() =>
      checkout.processCheckout(ctx, {
        tenantId: TENANT_A,
        branchId: BRANCH_A,
        customerId: null,
        cashSessionId: null,
        items: [
          {
            productId: product.id,
            variantId: null,
            quantity: 1,
            discountAmount: product.sellingPrice,
          },
        ],
        payment: { method: "CASH", amount: 0, isSplit: false },
      })
    ).toThrow("EMPTY_OR_ZERO_SALE");
  });
});

// ===========================================================================
// 7. InventoryEngine
// ===========================================================================

describe("InventoryEngine", () => {
  const ctx = makeCtx();

  it("registers a batch — getAvailability returns correct totalStock", () => {
    const inv = InventoryEngine.getInstance();
    // First add stock to ledger (InventoryEngine reads from StockLedger for totalStock)
    const ledger = StockLedgerEngine.getInstance();
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 50, unitCost: 300, referenceType: "PURCHASE",
      referenceId: "inv-po-001", actorId: USER_1,
    });

    const avail = inv.getAvailability(ctx, TENANT_A, BRANCH_A, PRODUCT_1, null);
    expect(avail.totalStock).toBe(50);
    expect(avail.availableStock).toBe(50);
    expect(avail.reservedStock).toBe(0);
  });

  it("creates a reservation and increases reservedStock", () => {
    const inv = InventoryEngine.getInstance();
    const ledger = StockLedgerEngine.getInstance();

    // Stock intake via StockLedger
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 20, unitCost: 200, referenceType: "PURCHASE",
      referenceId: "inv-po-002", actorId: USER_1,
    });

    const reservation = inv.reserveStock(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A,
      productId: PRODUCT_1, variantId: null,
      quantity: 5,
      referenceType: "CART",
      referenceId: "cart-001",
      ttlSeconds: 300,
    });

    expect(reservation.id).toBeTruthy();
    expect(reservation.quantity).toBe(5);
    expect(reservation.status).toBe("ACTIVE");

    const avail = inv.getAvailability(ctx, TENANT_A, BRANCH_A, PRODUCT_1, null);
    expect(avail.reservedStock).toBe(5);
    expect(avail.availableStock).toBe(15); // 20 - 5
  });

  it("rejects reservation when available stock is insufficient", () => {
    const inv = InventoryEngine.getInstance();
    const ledger = StockLedgerEngine.getInstance();

    // Only 3 in stock
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: PRODUCT_1, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 3, unitCost: 200, referenceType: "PURCHASE",
      referenceId: "inv-po-003", actorId: USER_1,
    });

    expect(() =>
      inv.reserveStock(ctx, {
        tenantId: TENANT_A, branchId: BRANCH_A,
        productId: PRODUCT_1, variantId: null,
        quantity: 10, // more than available
        referenceType: "CART", referenceId: "cart-002",
        ttlSeconds: 300,
      })
    ).toThrow(/INSUFFICIENT_AVAILABLE_STOCK/i);
  });
});
