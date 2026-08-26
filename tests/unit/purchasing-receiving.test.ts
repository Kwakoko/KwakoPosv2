import { describe, it, expect, beforeEach } from "vitest";
import { ScopedCommercialRepository, ScopedProductRepository, ScopedStockRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Purchasing & Goods Receipt Engine", () => {
  let store: InMemoryStore;
  let productRepo: ScopedProductRepository;
  let stockRepo: ScopedStockRepository;
  let commercialRepo: ScopedCommercialRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["MANAGER"],
    permissions: ["PURCHASE_CREATE", "PURCHASE_RECEIVE"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    productRepo = new ScopedProductRepository(store);
    stockRepo = new ScopedStockRepository(store);
    commercialRepo = new ScopedCommercialRepository(store);
  });

  it("creates PO, receives goods, increases stock via ledger and tracks supplier payable", () => {
    // 1. Supplier
    const supplier = commercialRepo.createSupplier(ctx, {
      name: "Bakhresa Food Products Ltd",
      phone: "+255 700 000 000",
      taxPin: "100-200-300",
    });
    expect(supplier.outstandingBalance).toBe(0);

    // 2. Product & Variant
    const prod = productRepo.createProduct(ctx, {
      name: "Azam Wheat Flour 2kg",
      sku: "AZAM-FLOUR-2KG",
      variants: [{ name: "Standard 2kg", sku: "FLOUR-2KG", price: 4000, costPrice: 3200 }],
    });
    const variantId = prod.variants![0].id;
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(0);

    // 3. Purchase Order for 100 bags @ 3,200 TZS = 320,000 TZS
    const po = commercialRepo.createPurchaseOrder(ctx, {
      supplierId: supplier.id,
      items: [{ variantId, quantityOrdered: 100, unitCost: 3200 }],
    });
    expect(po.totalAmount).toBe(320000);
    expect(po.status).toBe("APPROVED");

    // 4. Goods Receipt for 100 bags
    const { receipt, ledgers } = commercialRepo.createPurchaseReceipt(ctx, {
      purchaseOrderId: po.id,
      supplierId: supplier.id,
      deviceId: "dev-store-1",
      operationId: "op-rec-1",
      idempotencyKey: "idem-rec-1",
      items: [{ variantId, quantityReceived: 100, unitCost: 3200, batchNumber: "BATCH-2026-A" }],
    });

    expect(receipt.receiptNumber).toMatch(/^REC-/);
    expect(ledgers.length).toBe(1);
    expect(ledgers[0].quantity).toBe(100);
    expect(ledgers[0].movementType).toBe("PURCHASE");

    // Stock must be 100
    expect(stockRepo.getAvailableStock(ctx, variantId)).toBe(100);

    // Supplier payable balance must be 320,000 TZS
    const updatedSupplier = commercialRepo.getSupplierById(ctx, supplier.id);
    expect(updatedSupplier?.outstandingBalance).toBe(320000);
  });
});