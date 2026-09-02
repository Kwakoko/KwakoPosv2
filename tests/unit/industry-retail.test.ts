import { describe, it, expect } from "vitest";
import { RetailEngine, globalRetailEngine } from "../../packages/domain/src/retailEngine.js";
import { runRetailCertification } from "../../scripts/certification/runRetailCertification.js";
import { renderRetailDashboard } from "../../apps/web/src/retailDashboard.js";
import { globalRetailService } from "../../apps/api/src/services/retailService.js";
import { globalProductService } from "../../apps/api/src/services/productService.js";
import type { TenantContext, ProductVariant, Sale } from "@kwakopos2/contracts";

describe("Retail Industry Module Operating System Test Suite", () => {
  const engine = new RetailEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["ADMIN"],
    permissions: ["RETAIL_POS_CHECKOUT"],
  };

  it("should return valid Retail OS manifest and default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("retail_operating_system");
    expect(manifest.status).toBe("ACTIVE");
    expect(manifest.permissions).toContain("RETAIL_POS_CHECKOUT");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.taxRatePct).toBe(18.0);
    expect(settings.taxInclusivePricing).toBe(true);
  });

  it("should enforce Stock Ledger inventory balance invariant: Opening + In - Out +/- Adjustments = Current", () => {
    const current = engine.calculateStockLedgerBalance(100, 50, 20, -5);
    expect(current).toBe(125); // 100 + 50 - 20 - 5 = 125
  });

  it("should dynamically derive parent product stock from active variants", () => {
    const variants: ProductVariant[] = [
      { id: "v1", tenantId: dummyCtx.tenantId, branchId: dummyCtx.branchId, productId: "p1", name: "Red / M", sku: "SKU-1", price: 10000, costPrice: 6000, isActive: true, stock: 15 } as any,
      { id: "v2", tenantId: dummyCtx.tenantId, branchId: dummyCtx.branchId, productId: "p1", name: "Blue / L", sku: "SKU-2", price: 12000, costPrice: 7000, isActive: true, stock: 25 } as any,
      { id: "v3", tenantId: dummyCtx.tenantId, branchId: dummyCtx.branchId, productId: "p1", name: "Inactive", sku: "SKU-3", price: 10000, costPrice: 6000, isActive: false, stock: 50 } as any,
    ];

    const parentTotal = engine.calculateParentProductStockFromVariants(variants);
    expect(parentTotal.totalStock).toBe(40); // 15 + 25 = 40 (inactive variant 50 ignored)
  });

  it("should evaluate pricing, promotions, and POS cart totals correctly", () => {
    const cartItems = [
      { productId: "p1", variantId: "v1", quantity: 2, unitPrice: 50000, unitCost: 30000 },
      { productId: "p2", variantId: "v2", quantity: 1, unitPrice: 80000, unitCost: 50000 },
    ];

    // Subtotal: (2 * 50000) + (1 * 80000) = 180,000 TZS
    // Tax inclusive 18%: Taxable = 180000 / 1.18 = 152542, Tax = 27458
    // Total Cost: (2 * 30000) + (1 * 50000) = 110,000 TZS
    // Gross Profit: 180000 - 110000 = 70,000 TZS
    const totals = engine.calculatePOSCartTotals(cartItems, 0, 18.0, true);
    expect(totals.subtotal).toBe(180000);
    expect(totals.grandTotal).toBe(180000);
    expect(totals.totalCost).toBe(110000);
    expect(totals.grossProfit).toBe(70000);
  });

  it("should validate sale return limits and prevent returning more than sold quantity", () => {
    const mockSale: Sale = {
      id: "sale-1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      saleNumber: "RET-SALE-001",
      customerId: null,
      cashSessionId: null,
      subtotal: 100000,
      discountTotal: 0,
      taxTotal: 15254,
      grandTotal: 100000,
      totalCost: 60000,
      grossProfit: 40000,
      status: "COMPLETED",
      paymentStatus: "PAID",
      deviceId: "DEV-1",
      operationId: "OP-1",
      idempotencyKey: "KEY-1",
      soldById: null,
      soldAt: new Date().toISOString(),
      lines: [
        { id: "l1", saleId: "sale-1", productId: "p1", variantId: "v1", quantity: 2, unitPrice: 50000, unitCost: 30000, discountAmount: 0, taxAmount: 7627, lineTotal: 100000 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);

    // Valid return of 1 item
    const validRes = engine.validateSaleReturn(mockSale, [{ variantId: "v1", quantityReturned: 1, refundUnitPrice: 50000 }], settings);
    expect(validRes.valid).toBe(true);
    expect(validRes.totalRefundAmount).toBe(50000);

    // Invalid return of 5 items (exceeds sold qty of 2)
    const invalidRes = engine.validateSaleReturn(mockSale, [{ variantId: "v1", quantityReturned: 5, refundUnitPrice: 50000 }], settings);
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.error).toContain("exceeds original sold quantity");
  });

  it("should reconcile till session cash variances accurately", () => {
    // Opening: 100,000, Sales: 500,000, Refunds: 50,000, Expenses: 20,000 -> Expected: 530,000
    const rec1 = engine.reconcileTillSessionCash(100000, 500000, 50000, 20000, 530000);
    expect(rec1.expectedCash).toBe(530000);
    expect(rec1.variance).toBe(0);
    expect(rec1.status).toBe("BALANCED");

    // Deficit of 10,000 TZS
    const rec2 = engine.reconcileTillSessionCash(100000, 500000, 50000, 20000, 520000);
    expect(rec2.variance).toBe(-10000);
    expect(rec2.status).toBe("DEFICIT");
  });

  it("should run complete 30-Point Retail OS Certification Campaign", async () => {
    const cert = await runRetailCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.overallScore).toBe(100);
    expect(cert.evidencePackage.evaluations.length).toBe(30);
  });

  it("should render Super Admin & Manager Retail OS Command Center HTML", () => {
    const html = renderRetailDashboard();
    expect(html).toContain("KwakoPos Retail Command Center");
    expect(html).toContain("FAST RETAIL POS CHECKOUT");
    expect(html).toContain("EXPLAINABLE RETAIL AI INSIGHTS");
  });

  it("should execute POS checkout through globalRetailService", () => {
    const prod = globalProductService.createProduct(dummyCtx, {
      name: "Retail Shirt",
      sku: "RET-SHIRT-001",
      category: "Apparel",
      variants: [{ name: "Red / M", sku: "RET-SHIRT-RED-M", price: 25000, costPrice: 15000, isActive: true }],
    });
    const variantId = prod.variants![0].id;

    const sale = globalRetailService.processPOSCheckout(
      dummyCtx,
      [{ productId: prod.id, variantId, quantity: 2, unitPrice: 25000, unitCost: 15000 }],
      [{ amount: 50000, paymentMethod: "CASH" }]
    );
    expect(sale.grandTotal).toBe(50000);
    expect(sale.lines).toHaveLength(1);

    const auditEvents = globalRetailService.getAuditEvents(dummyCtx);
    expect(auditEvents.length).toBeGreaterThan(0);
    expect(auditEvents[0].action).toBe("POS_SALE_CHECKOUT");
  });
});
