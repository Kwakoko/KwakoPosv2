import { describe, it, expect, beforeEach } from "vitest";
import { ScopedCommercialRepository, ScopedProductRepository, ScopedStockRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Customer Credit & Returns Engine", () => {
  let store: InMemoryStore;
  let productRepo: ScopedProductRepository;
  let stockRepo: ScopedStockRepository;
  let commercialRepo: ScopedCommercialRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["MANAGER"],
    permissions: ["*"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    productRepo = new ScopedProductRepository(store);
    stockRepo = new ScopedStockRepository(store);
    commercialRepo = new ScopedCommercialRepository(store);
  });

  it("handles credit sales within limits and rejects exceeding credit limits", () => {
    // 1. Customer with 100,000 TZS credit limit
    const customer = commercialRepo.createCustomer(ctx, {
      name: "Mama Amina Supermarket",
      creditLimit: 100000,
    });

    const prod = productRepo.createProduct(ctx, {
      name: "Cooking Oil 5L",
      sku: "OIL-5L",
      variants: [{ name: "5L Can", sku: "OIL-5L-CAN", price: 30000, costPrice: 24000 }],
    });
    const variantId = prod.variants![0].id;

    // Opening stock = 10
    stockRepo.recordStockAdjustment(ctx, {
      variantId,
      adjustmentType: "INCREASE",
      quantityChange: 10,
      reason: "Initial stock",
      deviceId: "dev-1",
      operationId: "op-init",
      idempotencyKey: "idem-init",
    });

    // 2. Credit sale of 2 cans @ 30,000 = 60,000 (Within 100k limit)
    const { sale } = commercialRepo.createPosSale(ctx, {
      customerId: customer.id,
      items: [{ productId: prod.id, variantId, quantity: 2, unitPrice: 30000, unitCost: 24000 }],
      payments: [{ amount: 60000, paymentMethod: "CREDIT" }],
      deviceId: "pos-1",
      operationId: "op-credit-1",
      idempotencyKey: "idem-credit-1",
    });

    expect(sale.paymentStatus).toBe("PAID");
    expect(commercialRepo.getCustomerById(ctx, customer.id)?.currentBalance).toBe(60000);
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(8);

    // 3. Attempting another credit sale of 2 cans (60k + 60k = 120k > 100k limit) -> should not record credit payment
    const overSale = commercialRepo.createPosSale(ctx, {
      customerId: customer.id,
      items: [{ productId: prod.id, variantId, quantity: 2, unitPrice: 30000, unitCost: 24000 }],
      payments: [{ amount: 60000, paymentMethod: "CREDIT" }],
      deviceId: "pos-1",
      operationId: "op-credit-2",
      idempotencyKey: "idem-credit-2",
    });

    // Over credit sale leaves paymentStatus UNPAID
    expect(overSale.sale.paymentStatus).toBe("UNPAID");
    expect(commercialRepo.getCustomerById(ctx, customer.id)?.currentBalance).toBe(60000);
  });

  it("handles returns restoring inventory in GOOD condition and updating balance", () => {
    const customer = commercialRepo.createCustomer(ctx, { name: "John Doe", openingBalance: 60000 });
    const prod = productRepo.createProduct(ctx, {
      name: "Sugar 1kg",
      sku: "SUGAR-1KG",
      variants: [{ name: "1kg", sku: "SUGAR-1KG", price: 3000, costPrice: 2200 }],
    });
    const variantId = prod.variants![0].id;

    // Stock = 20
    stockRepo.recordStockAdjustment(ctx, {
      variantId,
      adjustmentType: "INCREASE",
      quantityChange: 20,
      reason: "Initial stock",
      deviceId: "dev-1",
      operationId: "op-init",
      idempotencyKey: "idem-init",
    });

    // Return 2 units @ 3,000 = 6,000 TZS
    const { returnRecord, ledgers } = commercialRepo.createSaleReturn(ctx, {
      customerId: customer.id,
      reason: "Wrong item selected",
      refundType: "STORE_CREDIT",
      deviceId: "pos-1",
      operationId: "op-ret-1",
      idempotencyKey: "idem-ret-1",
      items: [{ variantId, quantityReturned: 2, refundUnitPrice: 3000, condition: "GOOD" }],
    });

    expect(returnRecord.totalRefundAmount).toBe(6000);
    expect(ledgers.length).toBe(1);
    expect(ledgers[0].quantity).toBe(2);
    expect(["CUSTOMER_RETURN", "RETURN"]).toContain(ledgers[0].movementType);

    // Stock restored to 20 + 2 = 22
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(22);

    // Customer balance reduced from 60,000 to 54,000
    expect(commercialRepo.getCustomerById(ctx, customer.id)?.currentBalance).toBe(54000);
  });
});