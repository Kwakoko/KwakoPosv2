import { describe, it, expect } from "vitest";
import {
  normalizePaymentMethod,
  normalizeUnitConversionPayload,
  normalizeStockAdjustmentPayload,
  normalizeProductPayload,
  normalizeProductVariantPayload,
  normalizeSalePayload,
  normalizeSyncPayload,
} from "../../apps/web/src/services/payloadValidationService.js";
import {
  SyncPushRequestSchema,
  UnitConversionTransactionSchema,
  CreatePosSaleRequestSchema,
} from "@kwakopos2/contracts";

describe("Payload Validation Service — Offline Queue Convergence", () => {
  describe("Parent-Variant Stock Reconciliation & Conversion", () => {
    it("formats parent-variant conversion payload into authoritative schema", () => {
      const raw = {
        parentVariantId: "box-var-100",
        childVariantId: "piece-var-200",
        parentUnitsDeducted: "2",
        childUnitsProduced: "20",
        conversionRatio: "10",
        reason: "Offline bulk breakdown",
      };

      const normalized = normalizeUnitConversionPayload(raw, {
        operationId: "conv-op-1",
        idempotencyKey: "conv-idem-1",
        entityId: "conv-1",
      });

      expect(normalized).toEqual({
        id: "conv-1",
        tenantId: "tenant-default",
        branchId: "branch-default",
        parentVariantId: "box-var-100",
        childVariantId: "piece-var-200",
        parentUnitsDeducted: 2,
        childUnitsProduced: 20,
        conversionRatio: 10,
        conversionFactor: 10,
        reason: "Offline bulk breakdown",
        saleId: undefined,
        idempotencyKey: "conv-idem-1",
        createdAt: expect.any(String),
      });

      // Verify that it validates against the official contract schema
      const validated = UnitConversionTransactionSchema.parse(normalized);
      expect(validated.parentVariantId).toBe("box-var-100");
      expect(validated.childVariantId).toBe("piece-var-200");
      expect(validated.parentUnitsDeducted).toBe(2);
      expect(validated.childUnitsProduced).toBe(20);
    });

    it("handles alternate property names (snake_case, missing ratios) gracefully", () => {
      const raw = {
        parent_variant_id: "var-parent",
        child_variant_id: "var-child",
        parentQuantity: 3,
        childQuantity: 36,
      };

      const normalized = normalizeUnitConversionPayload(raw, {
        operationId: "op-fallback",
      });

      expect(normalized.parentVariantId).toBe("var-parent");
      expect(normalized.childVariantId).toBe("var-child");
      expect(normalized.parentUnitsDeducted).toBe(3);
      expect(normalized.childUnitsProduced).toBe(36);
      expect(normalized.conversionRatio).toBe(12);
    });
  });

  describe("Stock Adjustment / Reconciliation", () => {
    it("normalizes stock adjustment types and ensures positive quantityChange for INCREASE", () => {
      const raw = {
        variantId: "var-1",
        productId: "prod-1",
        adjustmentType: "ADD",
        quantityChange: -15,
        reason: "LOCAL_INVENTORY_RECONCILIATION",
      };

      const normalized = normalizeStockAdjustmentPayload(raw, {
        operationId: "adj-1",
        deviceId: "pos-terminal",
      });

      expect(normalized.adjustmentType).toBe("INCREASE");
      expect(normalized.quantityChange).toBe(15);
      expect(normalized.reason).toBe("LOCAL_INVENTORY_RECONCILIATION");
      expect(normalized.deviceId).toBe("pos-terminal");
    });

    it("normalizes SET and DECREASE adjustment types properly", () => {
      const setNorm = normalizeStockAdjustmentPayload({
        variant_id: "var-1",
        adjustmentType: "CYCLE_COUNT",
        quantity: 50,
      });
      expect(setNorm.adjustmentType).toBe("SET");
      expect(setNorm.quantityChange).toBe(50);

      const decNorm = normalizeStockAdjustmentPayload({
        variantId: "var-1",
        adjustmentType: "SHRINKAGE",
        quantity: 5,
      });
      expect(decNorm.adjustmentType).toBe("DECREASE");
      expect(decNorm.quantityChange).toBe(5);
    });
  });

  describe("Payment Method Normalization", () => {
    it("normalizes M-Pesa strings to MOBILE_MONEY enum with MPESA provider", () => {
      expect(normalizePaymentMethod("M-Pesa")).toEqual({
        paymentMethod: "MOBILE_MONEY",
        provider: "MPESA",
      });
      expect(normalizePaymentMethod("M-PESA")).toEqual({
        paymentMethod: "MOBILE_MONEY",
        provider: "MPESA",
      });
      expect(normalizePaymentMethod("mpesa")).toEqual({
        paymentMethod: "MOBILE_MONEY",
        provider: "MPESA",
      });
    });

    it("normalizes Airtel and Tigo to MOBILE_MONEY with appropriate providers", () => {
      expect(normalizePaymentMethod("Airtel Money")).toEqual({
        paymentMethod: "MOBILE_MONEY",
        provider: "AIRTEL_MONEY",
      });
      expect(normalizePaymentMethod("Tigo Pesa")).toEqual({
        paymentMethod: "MOBILE_MONEY",
        provider: "TIGO_PESA",
      });
    });

    it("normalizes Cash, Card, Bank, and Credit", () => {
      expect(normalizePaymentMethod("Cash")).toEqual({ paymentMethod: "CASH", provider: "CASH" });
      expect(normalizePaymentMethod("Card")).toEqual({ paymentMethod: "CARD" });
      expect(normalizePaymentMethod("CRDB Bank")).toEqual({ paymentMethod: "BANK", provider: "CRDB" });
      expect(normalizePaymentMethod("Credit")).toEqual({ paymentMethod: "CREDIT" });
    });
  });

  describe("Product & ProductVariant Normalization", () => {
    it("guarantees all nested variant fields are defined with correct types", () => {
      const product = {
        id: "prod-1",
        name: "Coca-Cola 500ml",
        sku: "COCA-500",
        sellingPrice: 1500,
        buyingPrice: 1000,
        variants: [
          {
            id: "var-coke-cold",
            name: "Chilled",
            sellingPrice: 1600,
            buyingPrice: 1000,
            stock: 24,
          },
        ],
      };

      const normalized = normalizeProductPayload(product, { entityId: "prod-1" });
      expect(normalized.variants).toEqual([
        {
          id: "var-coke-cold",
          productId: "prod-1",
          name: "Chilled",
          sku: "COCA-500-STD",
          barcode: null,
          price: 1600,
          costPrice: 1000,
          inventoryQuantity: 24,
          stock: 24,
          reorderLevel: 5,
          attributes: {},
          isActive: true,
        },
      ]);
    });
  });

  describe("Sale Normalization & Schema Conformance", () => {
    it("produces Sale payload that passes CreatePosSaleRequestSchema parse", () => {
      const rawSale = {
        id: "sale-999",
        cart: [
          {
            productId: "prod-1",
            variantId: "var-1",
            qty: 2,
            price: 1500,
            costPrice: 1000,
          },
        ],
        payments: [
          {
            amount: 3000,
            paymentMethod: "M-Pesa",
            mpesaRef: "QWE123RTY",
          },
        ],
        grandTotal: 3000,
      };

      const normalized = normalizeSalePayload(rawSale, {
        entityId: "sale-999",
        operationId: "op-sale-999",
        idempotencyKey: "idem-sale-999",
        deviceId: "pos-terminal",
      });

      // Verify that this now passes CreatePosSaleRequestSchema
      const validated = CreatePosSaleRequestSchema.parse(normalized);
      expect(validated.id).toBe("sale-999");
      expect(validated.payments?.[0].paymentMethod).toBe("MOBILE_MONEY");
      expect(validated.payments?.[0].provider).toBe("MPESA");
      expect(validated.payments?.[0].amount).toBe(3000);
    });
  });

  describe("Backdated StockAdjustment normalization", () => {
    it("preserves occurredAt for offline historical stock movements", () => {
      const occurredAt = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const normalized = normalizeStockAdjustmentPayload({
        variantId: "variant-backdated",
        adjustmentType: "INCREASE",
        quantityChange: 20,
        reason: "Historical receipt",
        occurredAt,
      });
      expect(normalized.occurredAt).toBe(occurredAt);
    });
  });

  describe("Universal normalizeSyncPayload for SyncPushRequest", () => {
    it("ensures a complete SyncPushRequest with mixed operations passes SyncPushRequestSchema", () => {
      const batch = [
        {
          id: "op-conv",
          entityType: "UnitConversionTransaction",
          entityId: "conv-1",
          operationType: "CREATE" as const,
          payload: {
            parentVariantId: "v-box",
            childVariantId: "v-bottle",
            parentUnitsDeducted: 1,
            childUnitsProduced: 24,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "idem-conv",
        },
        {
          id: "op-adj",
          entityType: "StockAdjustment",
          entityId: "adj-1",
          operationType: "CREATE" as const,
          payload: {
            variantId: "v-bottle",
            adjustmentType: "INCREASE",
            quantityChange: 24,
            reason: "LOCAL_INVENTORY_RECONCILIATION",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "idem-adj",
        },
        {
          id: "op-sale",
          entityType: "Sale",
          entityId: "sale-1",
          operationType: "CREATE" as const,
          payload: {
            items: [{ productId: "p-1", variantId: "v-bottle", quantity: 2, unitPrice: 1000 }],
            payments: [{ amount: 2000, paymentMethod: "M-PESA" }],
            grandTotal: 2000,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "idem-sale",
        },
      ];

      const pushRequest = {
        deviceId: "pos-terminal-01",
        operations: batch.map((op) => ({
          operationId: op.id,
          entityType: op.entityType,
          entityId: op.entityId,
          operationType: op.operationType,
          payload: normalizeSyncPayload(op.entityType, op.operationType, op.payload, {
            deviceId: "pos-terminal-01",
            operationId: op.id,
            idempotencyKey: op.idempotencyKey,
            entityId: op.entityId,
          }),
          clientCreatedAt: op.clientCreatedAt,
          idempotencyKey: op.idempotencyKey,
        })),
      };

      const parsed = SyncPushRequestSchema.parse(pushRequest);
      expect(parsed.operations.length).toBe(3);

      const convPayload: any = parsed.operations[0].payload;
      expect(convPayload.parentVariantId).toBe("v-box");
      expect(convPayload.childVariantId).toBe("v-bottle");
      expect(convPayload.parentUnitsDeducted).toBe(1);
      expect(convPayload.childUnitsProduced).toBe(24);

      const salePayload: any = parsed.operations[2].payload;
      expect(salePayload.payments[0].paymentMethod).toBe("MOBILE_MONEY");
      expect(salePayload.payments[0].provider).toBe("MPESA");
    });
  });
});
