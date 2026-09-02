import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext, Product, ProductVariant } from "@kwakopos2/contracts";
import {
  InMemoryStore,
  ScopedProductRepository,
  ScopedStockRepository,
} from "@kwakopos2/database";
import { assertStockLedgerImmutability } from "@kwakopos2/domain";

describe("Stock Ledger Movement Module & Cache Engine Test Suite", () => {
  let store: InMemoryStore;
  let productRepo: ScopedProductRepository;
  let stockRepo: ScopedStockRepository;

  const ctx: TenantContext = {
    tenantId: "TNT-STOCK-TEST-01",
    branchId: "BR-DSM-MAIN",
    userId: "USR-OPERATOR-01",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  let testProduct: Product;
  let testVariant: ProductVariant;

  beforeEach(() => {
    store = new InMemoryStore();
    productRepo = new ScopedProductRepository(store);
    stockRepo = new ScopedStockRepository(store);

    testProduct = productRepo.createProduct(ctx, {
      name: "Samsung Galaxy A15",
      sku: "SAM-A15",
      category: "Electronics",
      buyingPrice: 400000,
      sellingPrice: 500000,
      variants: [
        {
          name: "Samsung Galaxy A15 128GB Black",
          sku: "SAM-A15-128-BLK",
          barcode: "8806091234567",
          price: 500000,
          costPrice: 400000,
          inventoryQuantity: 0,
          stock: 0,
        },
      ],
    });

    testVariant = testProduct.variants![0];
  });

  it("should record opening stock movement with exact lineage (0 -> +100 -> 100)", () => {
    const ledger = stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "OPENING_STOCK",
      quantityChange: 100,
      referenceType: "INITIAL_INVENTORY",
      unitCost: 400000,
      deviceId: "POS-TEST-01",
      operationId: "OP-OPEN-01",
      idempotencyKey: "IDEM-OPEN-01",
      notes: "Opening Stock Count Jan 2026",
    });

    expect(ledger.quantityBefore).toBe(0);
    expect(ledger.quantityChange).toBe(100);
    expect(ledger.quantityAfter).toBe(100);
    expect(ledger.unitCost).toBe(400000);
    expect(ledger.totalCost).toBe(40000000);

    const availableStock = stockRepo.getAvailableStock(ctx, testVariant.id);
    expect(availableStock).toBe(100);

    const cache = stockRepo.getProductBranchStockCache(ctx, testVariant.id);
    expect(cache).not.toBeNull();
    expect(cache!.currentQuantity).toBe(100);
    expect(cache!.averageCost).toBe(400000);
    expect(cache!.stockValue).toBe(40000000);
  });

  it("should update Weighted Average Cost (WAC) on purchase receipt", () => {
    stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "OPENING_STOCK",
      quantityChange: 100,
      unitCost: 400000,
      deviceId: "POS-TEST-01",
      operationId: "OP-1",
      idempotencyKey: "IDEM-1",
    });

    stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "PURCHASE_RECEIVE",
      quantityChange: 50,
      unitCost: 450000,
      deviceId: "POS-TEST-01",
      operationId: "OP-2",
      idempotencyKey: "IDEM-2",
    });

    const cache = stockRepo.getProductBranchStockCache(ctx, testVariant.id);
    expect(cache!.currentQuantity).toBe(150);
    expect(cache!.averageCost).toBe(416666.67);
    expect(cache!.stockValue).toBe(62500000);
  });

  it("should deduction stock on POS sale and update stock balance cache", () => {
    stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "OPENING_STOCK",
      quantityChange: 100,
      unitCost: 400000,
      deviceId: "POS-01",
      operationId: "OP-1",
      idempotencyKey: "IDEM-1",
    });

    const saleLedger = stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "SALE",
      quantityChange: -20,
      referenceType: "SALE",
      referenceId: "SALE-1001",
      deviceId: "POS-01",
      operationId: "OP-SALE-01",
      idempotencyKey: "IDEM-SALE-01",
      notes: "POS Checkout #1001",
    });

    expect(saleLedger.quantityBefore).toBe(100);
    expect(saleLedger.quantityChange).toBe(-20);
    expect(saleLedger.quantityAfter).toBe(80);

    const available = stockRepo.getAvailableStock(ctx, testVariant.id);
    expect(available).toBe(80);
  });

  it("should record damage, expiry, and customer return movements cleanly", () => {
    stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "OPENING_STOCK",
      quantityChange: 50,
      unitCost: 400000,
      deviceId: "POS-01",
      operationId: "OP-1",
      idempotencyKey: "IDEM-1",
    });

    stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "DAMAGE",
      quantityChange: -5,
      deviceId: "POS-01",
      operationId: "OP-DMG",
      idempotencyKey: "IDEM-DMG",
      notes: "Water damage during offloading",
    });

    stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "EXPIRY",
      quantityChange: -2,
      deviceId: "POS-01",
      operationId: "OP-EXP",
      idempotencyKey: "IDEM-EXP",
    });

    stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "CUSTOMER_RETURN",
      quantityChange: 3,
      deviceId: "POS-01",
      operationId: "OP-RET",
      idempotencyKey: "IDEM-RET",
    });

    const stock = stockRepo.getAvailableStock(ctx, testVariant.id);
    expect(stock).toBe(46);
  });

  it("should enforce idempotency for duplicate idempotencyKey / operationId", () => {
    const l1 = stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "PURCHASE_RECEIVE",
      quantityChange: 25,
      unitCost: 400000,
      deviceId: "POS-01",
      operationId: "OP-DUPLICATE",
      idempotencyKey: "IDEM-DUPLICATE-99",
    });

    const l2 = stockRepo.recordMovement(ctx, {
      productId: testProduct.id,
      variantId: testVariant.id,
      movementType: "PURCHASE_RECEIVE",
      quantityChange: 25,
      unitCost: 400000,
      deviceId: "POS-01",
      operationId: "OP-DUPLICATE",
      idempotencyKey: "IDEM-DUPLICATE-99",
    });

    expect(l1.id).toBe(l2.id);
    expect(stockRepo.getAvailableStock(ctx, testVariant.id)).toBe(25);
  });

  it("should recalculate ProductBranchStock cache from immutable ledger ground truth", () => {
    stockRepo.recordMovement(ctx, { productId: testProduct.id, variantId: testVariant.id, movementType: "OPENING_STOCK", quantityChange: 100, unitCost: 400000, deviceId: "DEV1", operationId: "O1", idempotencyKey: "K1" });
    stockRepo.recordMovement(ctx, { productId: testProduct.id, variantId: testVariant.id, movementType: "SALE", quantityChange: -30, deviceId: "DEV1", operationId: "O2", idempotencyKey: "K2" });
    stockRepo.recordMovement(ctx, { productId: testProduct.id, variantId: testVariant.id, movementType: "PURCHASE_RECEIVE", quantityChange: 50, unitCost: 420000, deviceId: "DEV1", operationId: "O3", idempotencyKey: "K3" });

    store.productBranchStock.clear();
    expect(stockRepo.getProductBranchStockCache(ctx, testVariant.id)).toBeNull();

    const rebuilt = stockRepo.recalculateStockCacheFromLedger(ctx, testVariant.id);
    expect(rebuilt.length).toBe(1);
    expect(rebuilt[0].currentQuantity).toBe(120);
  });

  it("should enforce append-only immutability invariant on ledger rows", () => {
    expect(() => assertStockLedgerImmutability("LEDGER-UUID-1234")).toThrowError("IMMUTABLE_STOCK_LEDGER_VIOLATION");
  });
});
