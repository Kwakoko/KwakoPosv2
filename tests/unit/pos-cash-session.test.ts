import { describe, it, expect, beforeEach } from "vitest";
import { ScopedCommercialRepository, ScopedProductRepository, ScopedStockRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("POS Sales & Cash Session Engine", () => {
  let store: InMemoryStore;
  let productRepo: ScopedProductRepository;
  let stockRepo: ScopedStockRepository;
  let commercialRepo: ScopedCommercialRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["CASHIER"],
    permissions: ["SALE_CREATE", "PAYMENT_CREATE"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    productRepo = new ScopedProductRepository(store);
    stockRepo = new ScopedStockRepository(store);
    commercialRepo = new ScopedCommercialRepository(store);
  });

  it("manages complete cashier drawer session and variance calculation", () => {
    // 1. Open Session with 50,000 TZS opening float
    const session = commercialRepo.openCashSession(ctx, { openingCash: 50000 });
    expect(session.status).toBe("OPEN");
    expect(session.openingCash).toBe(50000);

    // 2. Add cash sale of 20,000 TZS
    session.cashSalesTotal = 20000;

    // 3. Record cash expense of 5,000 TZS (e.g. receipt paper / tea)
    commercialRepo.recordExpense(ctx, {
      cashSessionId: session.id,
      category: "SUPPLIES",
      amount: 5000,
      reason: "Receipt Rolls",
    });

    // 4. Expected cash = 50,000 + 20,000 - 5,000 = 65,000
    // If cashier counts 65,000 -> variance 0
    commercialRepo.sealCashSessionCount(ctx, session.id, { actualCash: 65000, deviceId: "POS-CASH-CERT" });
    const closedSession = commercialRepo.closeCashSession(ctx, session.id, {});
    expect(closedSession.status).toBe("CLOSED");
    expect(closedSession.expectedCash).toBe(65000);
    expect(closedSession.actualCash).toBe(65000);
    expect(closedSession.variance).toBe(0);

    // A second completed session can be closed only after its own physical count is sealed.
    const shortSessionOpen = commercialRepo.openCashSession(ctx, { openingCash: 50000 });
    shortSessionOpen.cashSalesTotal = 20000;
    commercialRepo.recordExpense(ctx, {
      cashSessionId: shortSessionOpen.id,
      category: "SUPPLIES",
      amount: 5000,
      reason: "Receipt Rolls",
    });
    commercialRepo.sealCashSessionCount(ctx, shortSessionOpen.id, { actualCash: 64000, deviceId: "POS-CASH-CERT" });
    const shortSession = commercialRepo.closeCashSession(ctx, shortSessionOpen.id, {});
    expect(shortSession.variance).toBe(-1000);
  });

  it("finalizes POS sale with automatic atomic StockLedger deduction", () => {
    // 1. Create Product & Variant
    const prod = productRepo.createProduct(ctx, {
      name: "Tanzanian Safari Tea",
      sku: "TEA-001",
      variants: [{ name: "500g Pack", sku: "TEA-500G", price: 5000, costPrice: 3000 }],
    });
    const variantId = prod.variants![0].id;

    // 2. Initial Opening Stock = 50
    stockRepo.recordStockAdjustment(ctx, {
      variantId,
      adjustmentType: "INCREASE",
      quantityChange: 50,
      reason: "Initial stock",
      deviceId: "dev-1",
      operationId: "op-init",
      idempotencyKey: "idem-init",
    });
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(50);

    // 3. Sell 3 units
    const { sale, ledgers } = commercialRepo.createPosSale(ctx, {
      items: [{ productId: prod.id, variantId, quantity: 3, unitPrice: 5000, unitCost: 3000 }],
      payments: [{ amount: 15000, paymentMethod: "CASH" }],
      deviceId: "pos-1",
      operationId: "op-sale-1",
      idempotencyKey: "idem-sale-1",
    });

    expect(sale.grandTotal).toBe(15000);
    expect(sale.paymentStatus).toBe("PAID");
    expect(ledgers.length).toBe(1);
    expect(ledgers[0].quantity).toBe(-3);
    expect(ledgers[0].movementType).toBe("SALE");

    // Stock must be 50 - 3 = 47
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(47);
  });
});