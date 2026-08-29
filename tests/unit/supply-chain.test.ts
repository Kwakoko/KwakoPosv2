import { describe, it, expect, beforeEach } from "vitest";
import { SupplyChainEngine } from "@kwakopos2/domain";

describe("Phase 36 — Supply Chain Operating Layer (KSCOL v1.0.0)", () => {
  let engine: SupplyChainEngine;

  beforeEach(() => {
    engine = new SupplyChainEngine();
  });

  it("should register suppliers and calculate governed health scorecards", () => {
    const sup = engine.registerSupplier({
      supplierId: "SUP-TEST-01", tenantId: "TEN-01", code: "TST01",
      name: "Tanzania Medical Distributors", type: "DISTRIBUTOR", status: "ACTIVE",
      country: "TZ", currency: "TZS", paymentTermsDays: 30, minimumOrderValue: 100000,
    });
    expect(sup.success).toBe(true);
    expect(sup.supplier?.name).toBe("Tanzania Medical Distributors");

    const sc = engine.calculateSupplierScorecard({
      supplierId: "SUP-TEST-01",
      onTimeDeliveryRatePct: 96, fillRatePct: 94, qualityRatePct: 98,
      priceVariancePct: 0, returnRatePct: 1, leadTimeAccuracyPct: 92,
    });

    expect(sc.success).toBe(true);
    expect(sc.scorecard?.healthScore).toBeGreaterThanOrEqual(90);
    expect(sc.scorecard?.ratingCategory).toBe("EXCELLENT");
  });

  it("should manage PO lifecycle from DRAFT → APPROVED → SENT with policy checks", () => {
    engine.registerSupplier({
      supplierId: "SUP-TEST-02", tenantId: "TEN-01", code: "TST02",
      name: "Pharma Wholesalers", type: "WHOLESALER", status: "ACTIVE",
      country: "TZ", currency: "TZS", minimumOrderValue: 50000,
    });

    const po = engine.createPurchaseOrder({
      tenantId: "TEN-01", poNumber: "PO-TEST-101", supplierId: "SUP-TEST-02",
      expectedDeliveryDate: "2026-09-30",
      items: [{ productId: "PRD-MED-01", sku: "SKU-M01", description: "Medicine A", quantityOrdered: 50, unitPrice: 2000 }],
      createdBy: "USR-01", idempotencyKey: "IDEM-TEST-101",
    });

    expect(po.success).toBe(true);
    expect(po.po?.status).toBe("DRAFT");
    expect(po.po?.totalAmount).toBe(100000);

    // Block send when in DRAFT
    const blockedSend = engine.sendPurchaseOrder(po.po!.poId, "USR-01");
    expect(blockedSend.success).toBe(false);

    // Approve
    const app = engine.approvePurchaseOrder(po.po!.poId, "APR-101", "USR-MGR");
    expect(app.success).toBe(true);

    // Send
    const send = engine.sendPurchaseOrder(po.po!.poId, "USR-01");
    expect(send.success).toBe(true);

    const updatedPo = engine.getPurchaseOrder(po.po!.poId);
    expect(updatedPo?.status).toBe("SENT");
  });

  it("should process goods receiving, update stock ledger reference, and perform 3-way match", () => {
    engine.registerSupplier({
      supplierId: "SUP-TEST-03", tenantId: "TEN-01", code: "TST03",
      name: "Global Supplies", type: "IMPORTER", status: "ACTIVE", country: "TZ", currency: "TZS",
    });

    const po = engine.createPurchaseOrder({
      tenantId: "TEN-01", poNumber: "PO-TEST-102", supplierId: "SUP-TEST-03",
      expectedDeliveryDate: "2026-09-30",
      items: [{ productId: "PRD-MED-02", sku: "SKU-M02", description: "Medicine B", quantityOrdered: 20, unitPrice: 5000 }],
      createdBy: "USR-01", idempotencyKey: "IDEM-TEST-102",
    });

    engine.approvePurchaseOrder(po.po!.poId, "APR-102", "USR-MGR");
    engine.sendPurchaseOrder(po.po!.poId, "USR-01");

    const rec = engine.processGoodsReceiving({
      tenantId: "TEN-01", poId: po.po!.poId, warehouseId: "WH-CENTRAL-01",
      receivedBy: "USR-WH",
      lines: [{ poItemId: po.po!.items[0].itemId, productId: "PRD-MED-02", quantityExpected: 20, quantityReceived: 20, quantityAccepted: 20, quantityRejected: 0, unitCost: 5000 }],
    });

    expect(rec.success).toBe(true);
    expect(rec.receivingRecord?.postedToInventory).toBe(true);
    expect(rec.receivingRecord?.stockLedgerRef).toBeDefined();

    const match = engine.performThreeWayMatch({
      tenantId: "TEN-01", poId: po.po!.poId, receivingId: rec.receivingRecord!.receivingId,
      invoiceRef: "INV-SUPP-555", invoiceAmount: 100000, approvedBy: "USR-FINANCE",
    });

    expect(match.success).toBe(true);
    expect(match.matchRecord?.status).toBe("PERFECT_MATCH");
  });

  it("should generate 5-scenario demand forecasts and replenishment recommendations", () => {
    const fstBase = engine.generateDemandForecast({
      tenantId: "TEN-01", productId: "PRD-MED-01", scenario: "BASE",
      horizonDays: 30, historicalBaselineDailyDemand: 20,
    });
    expect(fstBase.expectedDailyDemand).toBe(20);

    const fstGrowth = engine.generateDemandForecast({
      tenantId: "TEN-01", productId: "PRD-MED-01", scenario: "GROWTH",
      horizonDays: 30, historicalBaselineDailyDemand: 20,
    });
    expect(fstGrowth.expectedDailyDemand).toBe(25);

    const rep = engine.generateReplenishmentRecommendation({
      tenantId: "TEN-01", productId: "PRD-MED-01", currentStock: 5,
      inboundStock: 0, averageDailyDemand: 20, aiAssisted: true,
    });

    expect(rep.urgency).toBe("CRITICAL");
    expect(rep.recommendedQuantity).toBeGreaterThan(0);
    expect(rep.source).toBe("AI_PREDICTIVE");
  });
});
