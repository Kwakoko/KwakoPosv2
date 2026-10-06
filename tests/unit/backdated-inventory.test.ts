import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext, Product, ProductVariant } from "@kwakopos2/contracts";
import {
  InMemoryStore,
  ScopedProductRepository,
  ScopedStockRepository,
} from "@kwakopos2/database";
import {
  BACKDATING_MAX_THRESHOLD_DAYS,
  assertBackdatingThreshold,
  calculateStockAsOfDate,
  calculateBackdatedDiscrepancy,
  validateRetroactiveTimeline,
} from "@kwakopos2/domain";

describe("Backdated Inventory Function & 2-Year Threshold Suite", () => {
  let store: InMemoryStore;
  let productRepo: ScopedProductRepository;
  let stockRepo: ScopedStockRepository;

  const ctx: TenantContext = {
    tenantId: "TNT-BACKDATE-TEST",
    branchId: "BR-MAIN",
    userId: "USR-MANAGER",
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
      name: "Wholesale Sugar 50kg",
      sku: "SUGAR-50KG",
      category: "Commodities",
      buyingPrice: 100000,
      sellingPrice: 120000,
      variants: [
        {
          name: "Sugar 50kg Bag",
          sku: "SUGAR-50KG-BAG",
          price: 120000,
          costPrice: 100000,
          inventoryQuantity: 0,
          stock: 0,
        },
      ],
    });

    testVariant = testProduct.variants![0];
  });

  describe("1. Threshold Limit Enforcement (2 Years Max / 730 Days)", () => {
    it("should export BACKDATING_MAX_THRESHOLD_DAYS equal to 730", () => {
      expect(BACKDATING_MAX_THRESHOLD_DAYS).toBe(730);
    });

    it("should allow dates within the 2-year threshold (e.g. 30 days, 365 days, 729 days)", () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
      const twoYearsMinus1Day = new Date(Date.now() - 729 * 24 * 3600 * 1000).toISOString();

      expect(() => assertBackdatingThreshold(thirtyDaysAgo)).not.toThrow();
      expect(() => assertBackdatingThreshold(oneYearAgo)).not.toThrow();
      expect(() => assertBackdatingThreshold(twoYearsMinus1Day)).not.toThrow();
    });

    it("should allow dates with minor clock skew (up to 5 minutes into the future)", () => {
      const threeMinutesInFuture = new Date(Date.now() + 3 * 60 * 1000).toISOString();
      expect(() => assertBackdatingThreshold(threeMinutesInFuture)).not.toThrow();
    });

    it("should reject dates more than 730 days in the past with BACKDATING_THRESHOLD_EXCEEDED", () => {
      const twoYearsAndTwoDaysAgo = new Date(Date.now() - 732 * 24 * 3600 * 1000).toISOString();
      const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString();

      expect(() => assertBackdatingThreshold(twoYearsAndTwoDaysAgo)).toThrowError(
        /BACKDATING_THRESHOLD_EXCEEDED/,
      );
      expect(() => assertBackdatingThreshold(threeYearsAgo)).toThrowError(
        /BACKDATING_THRESHOLD_EXCEEDED/,
      );
    });

    it("should reject future dates beyond 5 minutes with FUTURE_STOCK_MOVEMENT_PROHIBITED", () => {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const tenMinutesInFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      expect(() => assertBackdatingThreshold(tomorrow)).toThrowError(
        /FUTURE_STOCK_MOVEMENT_PROHIBITED/,
      );
      expect(() => assertBackdatingThreshold(tenMinutesInFuture)).toThrowError(
        /FUTURE_STOCK_MOVEMENT_PROHIBITED/,
      );
    });

    it("should reject invalid date strings with INVALID_DATE", () => {
      expect(() => assertBackdatingThreshold("not-a-valid-date")).toThrowError(
        /INVALID_DATE/,
      );
    });

    it("should reject intentional backdating without INVENTORY_BACKDATE permission", () => {
      const limitedCtx = { ...ctx, permissions: ["INVENTORY_ADJUST"] };
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

      expect(() => {
        stockRepo.recordStockAdjustment(limitedCtx, {
          productId: testProduct.id,
          variantId: testVariant.id,
          adjustmentType: "INCREASE",
          quantityChange: 10,
          reason: "Permission regression",
          deviceId: "dev-permission",
          operationId: "op-permission",
          idempotencyKey: "KEY-PERMISSION",
          occurredAt: thirtyDaysAgo,
        });
      }).toThrowError(/INVENTORY_BACKDATE_PERMISSION_REQUIRED/);
    });
  });

  describe("2. Point-in-Time Historical Stock Calculation", () => {
    it("should accurately calculate historical stock balance as of a given timestamp", () => {
      const t0 = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString(); // 100 days ago: +100 units
      const t1 = new Date(Date.now() - 50 * 24 * 3600 * 1000).toISOString();  // 50 days ago: -20 units (balance 80)
      const t2 = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();  // 20 days ago: +40 units (balance 120)
      const t3 = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();   // 5 days ago: -15 units (balance 105)

      const ledgerEntries = [
        { id: "1", variantId: testVariant.id, quantityChange: 100, occurredAt: t0 },
        { id: "2", variantId: testVariant.id, quantityChange: -20, occurredAt: t1 },
        { id: "3", variantId: testVariant.id, quantityChange: 40, occurredAt: t2 },
        { id: "4", variantId: testVariant.id, quantityChange: -15, occurredAt: t3 },
      ];

      // As of 60 days ago: only t0 is counted -> 100
      const date60DaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
      expect(calculateStockAsOfDate(ledgerEntries as any, date60DaysAgo)).toBe(100);

      // As of 30 days ago: t0 + t1 -> 100 - 20 = 80
      const date30DaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      expect(calculateStockAsOfDate(ledgerEntries as any, date30DaysAgo)).toBe(80);

      // As of 10 days ago: t0 + t1 + t2 -> 100 - 20 + 40 = 120
      const date10DaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
      expect(calculateStockAsOfDate(ledgerEntries as any, date10DaysAgo)).toBe(120);

      // As of now: all entries -> 105
      expect(calculateStockAsOfDate(ledgerEntries as any, new Date())).toBe(105);
    });

    it("should calculate discrepancy delta correctly for backdated physical count (SET)", () => {
      // Historical stock as of count date was 80.
      // Physical count sheet from auditor says actual on-shelf was 85.
      // Discrepancy delta = 85 - 80 = +5.
      const deltaGain = calculateBackdatedDiscrepancy(85, 80);
      expect(deltaGain).toBe(5);

      // If count was 72: discrepancy delta = 72 - 80 = -8.
      const deltaLoss = calculateBackdatedDiscrepancy(72, 80);
      expect(deltaLoss).toBe(-8);
    });
  });

  describe("3. Retroactive Timeline Validation (Preventing Intermediate Negative Balances)", () => {
    it("should pass validation when retroactive deduction maintains positive running balance at all intermediate points", () => {
      const t0 = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(); // +100 (balance 100)
      const t1 = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(); // -30 (balance 70)
      const t2 = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(); // -20 (balance 50)

      const ledgerEntries = [
        { id: "1", variantId: testVariant.id, quantityChange: 100, movementType: "OPENING_STOCK", occurredAt: t0 },
        { id: "2", variantId: testVariant.id, quantityChange: -30, movementType: "SALE", occurredAt: t1 },
        { id: "3", variantId: testVariant.id, quantityChange: -20, movementType: "SALE", occurredAt: t2 },
      ];

      const backdatedTime = new Date(Date.now() - 50 * 24 * 3600 * 1000).toISOString();
      const result = validateRetroactiveTimeline(ledgerEntries as any, backdatedTime, -25);
      expect(result.valid).toBe(true);
      expect(result.lowestIntermediateBalance).toBe(25);
    });

    it("should reject a negative balance at the exact backdated insertion point", () => {
      const laterIntake = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
      const backdatedTime = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
      const ledgerEntries = [
        { id: "later", variantId: testVariant.id, quantityChange: 100, movementType: "PURCHASE_RECEIVE", occurredAt: laterIntake },
      ];

      const result = validateRetroactiveTimeline(ledgerEntries as any, backdatedTime, -1);
      expect(result.valid).toBe(false);
      expect(result.lowestIntermediateBalance).toBe(-1);
      expect(result.violationDate).toBe(new Date(backdatedTime).toISOString());
    });

    it("should detect invalid timeline when an intermediate running balance would dip below zero", () => {
      const t0 = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(); // +50 (balance 50)
      const t1 = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(); // -45 (balance 5)
      const t2 = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(); // +100 (balance 105)

      const ledgerEntries = [
        { id: "1", variantId: testVariant.id, quantityChange: 50, movementType: "OPENING_STOCK", occurredAt: t0 },
        { id: "2", variantId: testVariant.id, quantityChange: -45, movementType: "SALE", occurredAt: t1 },
        { id: "3", variantId: testVariant.id, quantityChange: 100, movementType: "PURCHASE_RECEIVE", occurredAt: t2 },
      ];

      // Backdating a deduction of -10 at 50 days ago (between t0 and t1):
      // Running balance at t1 would dip to 50 - 10 - 45 = -5!
      const backdatedTime = new Date(Date.now() - 50 * 24 * 3600 * 1000).toISOString();
      const result = validateRetroactiveTimeline(ledgerEntries as any, backdatedTime, -10);
      expect(result.valid).toBe(false);
      expect(result.lowestIntermediateBalance).toBe(-5);
      expect(result.violationDate).toBeDefined();
    });
  });

  describe("4. ScopedStockRepository Backdated Adjustments", () => {
    it("should record a backdated stock adjustment within the 2-year window", () => {
      // 1. Initial intake 30 days ago
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      stockRepo.recordMovement(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        movementType: "OPENING_STOCK",
        quantityChange: 50,
        referenceType: "INITIAL_INVENTORY",
        unitCost: 100000,
        deviceId: "dev-01",
        operationId: "op-init",
        idempotencyKey: "KEY-INIT",
        occurredAt: thirtyDaysAgo,
      });

      // 2. Sale 15 days ago: -10 units
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
      stockRepo.recordMovement(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        movementType: "SALE",
        quantityChange: -10,
        referenceType: "SALE",
        unitCost: 100000,
        deviceId: "dev-01",
        operationId: "op-sale",
        idempotencyKey: "KEY-SALE",
        occurredAt: fifteenDaysAgo,
      });

      expect(stockRepo.getAvailableStock(ctx, testVariant.id)).toBe(40);

      // 3. Backdated addition 20 days ago (between intake and sale): +20 units
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
      const { adjustment, ledger } = stockRepo.recordStockAdjustment(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        adjustmentType: "INCREASE",
        quantityChange: 20,
        reason: "Discovered supplier delivery receipt",
        deviceId: "dev-01",
        operationId: "op-adj-1",
        idempotencyKey: "KEY-ADJ-1",
        occurredAt: twentyDaysAgo,
      });

      expect(adjustment.quantityChange).toBe(20);
      expect(adjustment.occurredAt).toBe(twentyDaysAgo);
      expect(ledger.quantityBefore).toBe(50);
      expect(ledger.quantityAfter).toBe(70);
      // New total stock should be 40 + 20 = 60
      expect(stockRepo.getAvailableStock(ctx, testVariant.id)).toBe(60);

      // Stock as of 25 days ago should be 50
      const twentyFiveDaysAgo = new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString();
      expect(stockRepo.getStockAsOfDate(ctx, testVariant.id, twentyFiveDaysAgo)).toBe(50);

      // Stock as of 18 days ago (after backdated addition, before sale) should be 50 + 20 = 70
      const eighteenDaysAgo = new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString();
      expect(stockRepo.getStockAsOfDate(ctx, testVariant.id, eighteenDaysAgo)).toBe(70);
    });

    it("should record a backdated physical count (SET) preserving intermediate movements", () => {
      // 1. Intake 40 days ago: 100 units
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
      stockRepo.recordMovement(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        movementType: "OPENING_STOCK",
        quantityChange: 100,
        referenceType: "INITIAL_INVENTORY",
        unitCost: 100000,
        deviceId: "dev-01",
        operationId: "op-init-2",
        idempotencyKey: "KEY-INIT-2",
        occurredAt: fortyDaysAgo,
      });

      // 2. Subsequent sales after day 30: 30 units sold across days 25 to 5
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
      stockRepo.recordMovement(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        movementType: "SALE",
        quantityChange: -30,
        referenceType: "SALE",
        unitCost: 100000,
        deviceId: "dev-01",
        operationId: "op-sale-2",
        idempotencyKey: "KEY-SALE-2",
        occurredAt: twentyDaysAgo,
      });

      // Current balance today is 70
      expect(stockRepo.getAvailableStock(ctx, testVariant.id)).toBe(70);

      // 3. User records a backdated physical count conducted on day 30:
      // On day 30, physical count showed 95 units (instead of book stock 100).
      // Discrepancy on day 30 was 95 - 100 = -5.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { adjustment, ledger } = stockRepo.recordStockAdjustment(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        adjustmentType: "SET",
        quantityChange: 95,
        reason: "End-of-month Physical Inventory Count",
        deviceId: "dev-01",
        operationId: "op-count-1",
        idempotencyKey: "KEY-COUNT-1",
        occurredAt: thirtyDaysAgo,
      });

      // Delta applied must be -5
      expect(adjustment.quantityChange).toBe(-5);
      expect(ledger.quantityBefore).toBe(100);
      expect(ledger.quantityAfter).toBe(95);

      // Current stock today must be 70 + (-5) = 65, preserving the subsequent 30-unit sale!
      expect(stockRepo.getAvailableStock(ctx, testVariant.id)).toBe(65);

      // Stock as of day 30 after adjustment should be exactly 95!
      expect(stockRepo.getStockAsOfDate(ctx, testVariant.id, thirtyDaysAgo)).toBe(95);
    });

    it("should reject backdated adjustment older than 730 days (2 years)", () => {
      const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString();
      expect(() => {
        stockRepo.recordStockAdjustment(ctx, {
          productId: testProduct.id,
          variantId: testVariant.id,
          adjustmentType: "INCREASE",
          quantityChange: 10,
          reason: "Old adjustment",
          deviceId: "dev-01",
          operationId: "op-old",
          idempotencyKey: "KEY-OLD",
          occurredAt: threeYearsAgo,
        });
      }).toThrowError(/BACKDATING_THRESHOLD_EXCEEDED/);
    });

    it("should reject backdated deduction if intermediate stock would drop below zero", () => {
      // 1. Initial 50 units 60 days ago
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
      stockRepo.recordMovement(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        movementType: "OPENING_STOCK",
        quantityChange: 50,
        referenceType: "INITIAL_INVENTORY",
        unitCost: 100000,
        deviceId: "dev-01",
        operationId: "op-lineage-1",
        idempotencyKey: "KEY-L1",
        occurredAt: sixtyDaysAgo,
      });

      // 2. Sold 45 units 40 days ago (running balance: 5)
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
      stockRepo.recordMovement(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        movementType: "SALE",
        quantityChange: -45,
        referenceType: "SALE",
        unitCost: 100000,
        deviceId: "dev-01",
        operationId: "op-lineage-2",
        idempotencyKey: "KEY-L2",
        occurredAt: fortyDaysAgo,
      });

      // 3. New intake 20 days ago: +100 units (running balance: 105)
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
      stockRepo.recordMovement(ctx, {
        productId: testProduct.id,
        variantId: testVariant.id,
        movementType: "PURCHASE_RECEIVE",
        quantityChange: 100,
        referenceType: "PURCHASE",
        unitCost: 100000,
        deviceId: "dev-01",
        operationId: "op-lineage-3",
        idempotencyKey: "KEY-L3",
        occurredAt: twentyDaysAgo,
      });

      // Attempting to deduct 10 units backdated to 50 days ago:
      // Even though today's stock is 105, at 40 days ago balance was only 5.
      // Deducting 10 would cause stock at 40 days ago to dip to -5!
      const fiftyDaysAgo = new Date(Date.now() - 50 * 24 * 3600 * 1000).toISOString();
      expect(() => {
        stockRepo.recordStockAdjustment(ctx, {
          productId: testProduct.id,
          variantId: testVariant.id,
          adjustmentType: "DECREASE",
          quantityChange: 10,
          reason: "Backdated loss discovered",
          deviceId: "dev-01",
          operationId: "op-bad-timeline",
          idempotencyKey: "KEY-BAD-TIMELINE",
          occurredAt: fiftyDaysAgo,
        });
      }).toThrowError(/INSUFFICIENT_STOCK: Retroactive adjustment would cause historical balance to drop below 0/);
    });
  });
});
