import { describe, it, expect } from "vitest";
import type { TenantContext } from "@kwakopos2/contracts";
import {
  globalCommercialRepository,
  globalFinanceRepository,
  wireCommercialFinanceBridges,
  globalInMemoryStore,
} from "@kwakopos2/database";

describe("H-010: High-Throughput POS Sales & Double-Entry Ledger Load Benchmark", () => {
  it("should process 30 rapid POS sales with full financial double-entry ledger balancing", async () => {
    const ctx: TenantContext = {
      tenantId: "TENANT_THROUGHPUT_01",
      branchId: "BRANCH_MAIN",
      userId: "CASHIER_01",
      roles: ["CASHIER"],
      permissions: ["*"],
    };

    // Ensure default chart of accounts
    await globalFinanceRepository.ensureDefaultAccounts(ctx);
    wireCommercialFinanceBridges(globalCommercialRepository, globalFinanceRepository);

    // Register product & variant in in-memory store so invariant C002 passes
    const productId = "PROD_BENCH_ITEM";
    const variantId = "VAR_BENCH_ITEM";

    globalInMemoryStore.products.set(productId, {
      id: productId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: "Benchmark Item",
      sku: "SKU-BENCH-01",
      category: "General",
      buyingPrice: 3500,
      sellingPrice: 5000,
      currentMarginAmount: 1500,
      currentMarginPercentage: 30,
      images: [],
      hasVariants: true,
      totalStock: 1000,
      reservedStock: 0,
      availableStock: 1000,
      lowStockVariantsCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    globalInMemoryStore.variants.set(variantId, {
      id: variantId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId,
      name: "Default Variant",
      sku: "SKU-BENCH-VAR-01",
      inheritBuyingPrice: true,
      inheritSellingPrice: true,
      price: 5000,
      costPrice: 3500,
      currentMarginAmount: 1500,
      currentMarginPercentage: 30,
      inventoryQuantity: 1000,
      reservedQuantity: 0,
      reorderLevel: 10,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const SALES_COUNT = 30;
    const startTime = Date.now();

    const salePromises = Array.from({ length: SALES_COUNT }, async (_, idx) => {
      return globalCommercialRepository.createPosSale(ctx, {
        customerId: null,
        items: [
          {
            productId,
            variantId,
            productName: `Item ${idx}`,
            quantity: 2,
            unitPrice: 5000,
            unitCost: 3500,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: 10000,
          },
        ],
        payments: [
          {
            paymentMethod: "CASH",
            amount: 10000,
            referenceNumber: `CASH-REF-${idx}`,
          },
        ],
        idempotencyKey: `SALE-THROUGHPUT-${idx}-${Date.now()}`,
        deviceId: "POS-TERMINAL-01",
        notes: `Load test sale ${idx}`,
      });
    });

    const sales = await Promise.all(salePromises);
    const durationMs = Date.now() - startTime;

    expect(sales.length).toBe(SALES_COUNT);
    // 30 sales processed rapidly
    expect(durationMs).toBeLessThan(3000);

    for (const s of sales) {
      expect(s.sale.id).toBeDefined();
      expect(s.sale.grandTotal).toBe(10000);
      expect(s.sale.status).toBe("COMPLETED");
    }

    // Verify financial journals were created and balanced
    const journals = await globalFinanceRepository.getJournals(ctx);
    expect(journals.length).toBeGreaterThanOrEqual(SALES_COUNT);

    for (const journal of journals) {
      // Invariant F001: Journal must balance (totalDebit == totalCredit)
      expect(Math.abs(journal.totalDebit - journal.totalCredit)).toBeLessThanOrEqual(0.01);
    }
  });
});
