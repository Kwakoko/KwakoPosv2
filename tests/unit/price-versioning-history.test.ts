import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryStore,
  ScopedProductRepository,
  ScopedCommercialRepository,
  ScopedStockRepository,
} from "@kwakopos2/database";
import { calculateMargin, assertPriceHistoryImmutability } from "@kwakopos2/domain";
import type { TenantContext, Product, CreateProductRequest } from "@kwakopos2/contracts";

describe("Product Price Versioning & Price History Ledger Unit Tests", () => {
  let store: InMemoryStore;
  let productRepo: ScopedProductRepository;
  let commercialRepo: ScopedCommercialRepository;
  let stockRepo: ScopedStockRepository;

  const ctx: TenantContext = {
    tenantId: "tenant-price-test-1001",
    branchId: "branch-price-test-2002",
    userId: "user-admin-9001",
    roles: ["ADMIN"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    productRepo = new ScopedProductRepository(store);
    commercialRepo = new ScopedCommercialRepository(store);
    stockRepo = new ScopedStockRepository(store);
  });

  it("should calculate profit margin amount and margin percentage correctly", () => {
    // 1200 selling, 800 buying => margin 400, margin % = 400 / 1200 * 100 = 33.33%
    const margin1 = calculateMargin(800, 1200);
    expect(margin1.marginAmount).toBe(400);
    expect(margin1.marginPercentage).toBe(33.33);

    // 1000 selling, 700 buying => margin 300, margin % = 300 / 1000 * 100 = 30%
    const margin2 = calculateMargin(700, 1000);
    expect(margin2.marginAmount).toBe(300);
    expect(margin2.marginPercentage).toBe(30);

    // Free items or zero selling price
    const marginZero = calculateMargin(100, 0);
    expect(marginZero.marginAmount).toBe(-100);
    expect(marginZero.marginPercentage).toBe(0);
  });

  it("should auto-generate Version 1 (INITIAL_PRICE) history entry when a product is created", () => {
    const req: CreateProductRequest = {
      name: "Coca Cola 500ml",
      sku: "COCA-500ML",
      buyingPrice: 700,
      sellingPrice: 1000,
      category: "Beverages",
    };

    const product = productRepo.createProduct(ctx, req);
    expect(product.buyingPrice).toBe(700);
    expect(product.sellingPrice).toBe(1000);
    expect(product.currentMarginAmount).toBe(300);
    expect(product.currentMarginPercentage).toBe(30);
    expect(product.activePriceVersionId).toBeDefined();

    const history = productRepo.getPriceHistory(ctx, product.id);
    expect(history.length).toBe(1);
    expect(history[0].versionNumber).toBe(1);
    expect(history[0].changeType).toBe("INITIAL_PRICE");
    expect(history[0].previousBuyingPrice).toBe(0);
    expect(history[0].newBuyingPrice).toBe(700);
    expect(history[0].previousSellingPrice).toBe(0);
    expect(history[0].newSellingPrice).toBe(1000);
    expect(history[0].marginAmount).toBe(300);
    expect(history[0].marginPercentage).toBe(30);
  });

  it("should atomically record a price change and update current product pricing snapshot", () => {
    const product = productRepo.createProduct(ctx, {
      name: "Fresh Milk 1L",
      sku: "MILK-1L",
      buyingPrice: 750,
      sellingPrice: 1100,
    });

    // Record price change: 750 -> 800 buying, 1100 -> 1200 selling
    const result = productRepo.recordPriceChange(ctx, {
      productId: product.id,
      newBuyingPrice: 800,
      newSellingPrice: 1200,
      changeType: "SUPPLIER_CHANGE",
      changeReason: "Supplier Price Increase July 2026",
      deviceId: "POS-TERMINAL-01",
      operationId: "op-price-001",
      idempotencyKey: "idem-price-001",
    });

    expect(result.priceHistory.versionNumber).toBe(2);
    expect(result.priceHistory.previousBuyingPrice).toBe(750);
    expect(result.priceHistory.newBuyingPrice).toBe(800);
    expect(result.priceHistory.previousSellingPrice).toBe(1100);
    expect(result.priceHistory.newSellingPrice).toBe(1200);
    expect(result.priceHistory.marginAmount).toBe(400);
    expect(result.priceHistory.marginPercentage).toBe(33.33);

    // Verify current product pricing snapshot updated
    expect(result.product.buyingPrice).toBe(800);
    expect(result.product.sellingPrice).toBe(1200);
    expect(result.product.currentMarginAmount).toBe(400);

    // Verify price history ledger retains both versions
    const history = productRepo.getPriceHistory(ctx, product.id);
    expect(history.length).toBe(2);
    expect(history[0].versionNumber).toBe(2);
    expect(history[1].versionNumber).toBe(1);
  });

  it("should enforce Price History ledger immutability invariant", () => {
    expect(() => assertPriceHistoryImmutability("history-entry-1234")).toThrowError(
      /IMMUTABLE_PRICE_HISTORY_VIOLATION/
    );
  });

  it("should isolate historical sales transaction snapshots from subsequent product price updates", () => {
    // 1. Setup Product
    const product = productRepo.createProduct(ctx, {
      name: "Sugar 1kg",
      sku: "SUGAR-1KG",
      buyingPrice: 700,
      sellingPrice: 1000,
    });

    const fullProduct = productRepo.getProductById(ctx, product.id)!;
    const variant = fullProduct.variants![0];

    // Add initial stock via ledger
    stockRepo.recordMovement(ctx, {
      productId: product.id,
      variantId: variant.id,
      movementType: "OPENING_STOCK",
      quantityChange: 100,
      unitCost: 700,
      referenceType: "OPENING",
      deviceId: "POS-001",
      operationId: "op-stock-sugar",
      idempotencyKey: "idem-stock-sugar",
    });

    // 2. Perform POS sale when price is 700 / 1000
    const sale = commercialRepo.createPosSale(ctx, {
      cashierId: ctx.userId!,
      items: [
        {
          productId: product.id,
          variantId: variant.id,
          quantity: 2,
          unitPrice: 1000,
        },
      ],
      payments: [{ paymentMethod: "CASH", amount: 2000 }],
      deviceId: "POS-001",
      operationId: "op-sale-jan",
      idempotencyKey: "idem-sale-jan",
    });

    // Verify January checkout snapshot: unitPrice = 1000, unitCost = 700, profit = 300 per unit (600 total)
    const janLine = sale.lines[0];
    expect(janLine.unitPrice).toBe(1000);
    expect(janLine.unitCost).toBe(700);

    // 3. Price change in July: buying 700 -> 900, selling 1000 -> 1400
    productRepo.recordPriceChange(ctx, {
      productId: product.id,
      newBuyingPrice: 900,
      newSellingPrice: 1400,
      changeType: "PRICE_UPDATE",
      changeReason: "Market Price Inflation",
      deviceId: "POS-001",
      operationId: "op-price-july",
      idempotencyKey: "idem-price-july",
    });

    // Verify current product price is updated to 900 / 1400
    const updatedProduct = productRepo.getProductById(ctx, product.id)!;
    expect(updatedProduct.buyingPrice).toBe(900);
    expect(updatedProduct.sellingPrice).toBe(1400);

    // CRITICAL POS RULE: The historical January sale MUST retain its original checkout prices (1000 selling, 700 cost)!
    const historicalLine = sale.lines[0];
    expect(historicalLine.unitPrice).toBe(1000);
    expect(historicalLine.unitCost).toBe(700);
  });
});
