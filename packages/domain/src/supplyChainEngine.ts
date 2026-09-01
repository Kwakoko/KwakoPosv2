import {
  SupplyChainSupplier, SupplierScorecard, ProductSupplyProfile,
  SupplyChainPurchaseOrder, SupplyChainPurchaseOrderItem,
  InboundShipment, GoodsReceivingRecord, ReceivingLine, ThreeWayMatchRecord,
  Warehouse, WarehouseLocation, ReplenishmentRecommendation, DemandForecast,
  InventoryBalancingRecommendation, SupplyChainControlTowerMetrics, SupplyChainAuditEntry,
  SupplyRiskLevel,
} from "@kwakopos2/contracts";

// ============================================================
// Phase 36 — KwakoPos Supply Chain Operating Layer (KSCOL v1.0.0)
// ============================================================
// Governing principles:
//   1. StockLedger is the sole authoritative inventory truth.
//   2. GeneralLedger & Treasury are the sole authoritative financial & liquidity truth.
//   3. Supply Chain orchestrates planning, sourcing, POs, shipments, receiving,
//      reconciliation, replenishment, and AI optimization without corrupting ledgers.
// ============================================================

export class SupplyChainEngine {
  private suppliers: Map<string, SupplyChainSupplier> = new Map();
  private productProfiles: Map<string, ProductSupplyProfile> = new Map();
  private purchaseOrders: Map<string, SupplyChainPurchaseOrder> = new Map();
  private shipments: Map<string, InboundShipment> = new Map();
  private receivingRecords: Map<string, GoodsReceivingRecord> = new Map();
  private threeWayMatches: Map<string, ThreeWayMatchRecord> = new Map();
  private warehouses: Map<string, Warehouse> = new Map();
  private replenishmentRecs: Map<string, ReplenishmentRecommendation> = new Map();
  private demandForecasts: Map<string, DemandForecast> = new Map();
  private balancingRecs: Map<string, InventoryBalancingRecommendation> = new Map();
  private auditLedger: SupplyChainAuditEntry[] = [];
  private executedPoIds: Set<string> = new Set(); // idempotency

  constructor() {
    this._seedDefaultCentralWarehouse();
  }

  // ─────────────────────────────────────────────────────────
  // 1. Supplier Registry & Scorecards
  // ─────────────────────────────────────────────────────────

  public registerSupplier(params: Omit<SupplyChainSupplier, "createdAt" | "updatedAt" | "country" | "currency" | "paymentTermsDays" | "minimumOrderValue" | "leadTimeDays" | "isPreferred"> & {
    country?: string;
    currency?: string;
    paymentTermsDays?: number;
    minimumOrderValue?: number;
    leadTimeDays?: number;
    isPreferred?: boolean;
  }): {
    success: boolean; supplier?: SupplyChainSupplier; error?: string;
  } {
    if (!params.supplierId || !params.tenantId || !params.name || !params.code) {
      return { success: false, error: "supplierId, tenantId, name, and code are required" };
    }
    const now = new Date().toISOString();
    const supplier: SupplyChainSupplier = {
      ...params,
      country: params.country ?? "TZ",
      currency: params.currency ?? "TZS",
      paymentTermsDays: params.paymentTermsDays ?? 30,
      minimumOrderValue: params.minimumOrderValue ?? 0,
      leadTimeDays: params.leadTimeDays ?? 7,
      isPreferred: params.isPreferred ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.suppliers.set(params.supplierId, supplier);
    this._writeAudit(params.tenantId, "SUPPLIER_REGISTERED", "SYSTEM", params.supplierId,
      `Supplier registered: ${params.name} (${params.code}) - Type: ${params.type}`);
    return { success: true, supplier };
  }

  public getSupplier(supplierId: string): SupplyChainSupplier | undefined {
    return this.suppliers.get(supplierId);
  }

  public listSuppliers(tenantId: string): SupplyChainSupplier[] {
    return Array.from(this.suppliers.values()).filter(s => s.tenantId === tenantId);
  }

  public calculateSupplierScorecard(params: {
    supplierId: string;
    onTimeDeliveryRatePct: number;
    fillRatePct: number;
    qualityRatePct: number;
    priceVariancePct: number;
    returnRatePct: number;
    leadTimeAccuracyPct: number;
    disputeCount?: number;
  }): { success: boolean; scorecard?: SupplierScorecard; error?: string } {
    const supplier = this.suppliers.get(params.supplierId);
    if (!supplier) return { success: false, error: "Supplier not found" };

    // Governed weighted formula: OTD (30%) + Fill (25%) + Quality (25%) + LeadTime (10%) + Return (10%)
    const healthScore = Math.round(
      params.onTimeDeliveryRatePct * 0.30 +
      params.fillRatePct * 0.25 +
      params.qualityRatePct * 0.25 +
      params.leadTimeAccuracyPct * 0.10 +
      Math.max(0, 100 - params.returnRatePct) * 0.10
    );

    let ratingCategory: SupplierScorecard["ratingCategory"] = "EXCELLENT";
    if (healthScore < 90) ratingCategory = "GOOD";
    if (healthScore < 75) ratingCategory = "ADEQUATE";
    if (healthScore < 60) ratingCategory = "POOR";
    if (healthScore < 45) ratingCategory = "CRITICAL";

    const scorecard: SupplierScorecard = {
      supplierId: params.supplierId,
      calculatedAt: new Date().toISOString(),
      onTimeDeliveryRatePct: params.onTimeDeliveryRatePct,
      fillRatePct: params.fillRatePct,
      qualityRatePct: params.qualityRatePct,
      priceVariancePct: params.priceVariancePct,
      returnRatePct: params.returnRatePct,
      leadTimeAccuracyPct: params.leadTimeAccuracyPct,
      disputeCount: params.disputeCount ?? 0,
      healthScore,
      ratingCategory,
    };

    supplier.scorecard = scorecard;
    supplier.updatedAt = new Date().toISOString();

    this._writeAudit(supplier.tenantId, "SCORECARD_UPDATED", "SYSTEM", params.supplierId,
      `Scorecard updated: Health ${healthScore}/100 (${ratingCategory})`);

    return { success: true, scorecard };
  }

  // ─────────────────────────────────────────────────────────
  // 2. Product Supply Profile
  // ─────────────────────────────────────────────────────────

  public setProductSupplyProfile(profile: ProductSupplyProfile): { success: boolean; error?: string } {
    if (!profile.productId || !profile.tenantId || !profile.primarySupplierId) {
      return { success: false, error: "productId, tenantId, and primarySupplierId are required" };
    }
    this.productProfiles.set(profile.productId, profile);
    return { success: true };
  }

  public getProductSupplyProfile(productId: string): ProductSupplyProfile | undefined {
    return this.productProfiles.get(productId);
  }

  // ─────────────────────────────────────────────────────────
  // 3. Purchase Order Management & Lifecycle
  // ─────────────────────────────────────────────────────────

  public createPurchaseOrder(params: {
    tenantId: string;
    branchId?: string;
    warehouseId?: string;
    poNumber: string;
    supplierId: string;
    expectedDeliveryDate: string;
    items: (Omit<SupplyChainPurchaseOrderItem, "itemId" | "poId" | "quantityConfirmed" | "quantityShipped" | "quantityReceived" | "receivedTotal" | "lineTotal" | "status"> & { lineTotal?: number })[];
    createdBy: string;
    idempotencyKey: string;
    requisitionRef?: string;
  }): { success: boolean; po?: SupplyChainPurchaseOrder; blockedByPolicy?: string; error?: string } {
    // Idempotency guard
    const existing = Array.from(this.purchaseOrders.values())
      .find(p => p.idempotencyKey === params.idempotencyKey && p.tenantId === params.tenantId);
    if (existing) {
      return { success: false, error: `Idempotency violation: PO with key ${params.idempotencyKey} already exists` };
    }

    const supplier = this.suppliers.get(params.supplierId);
    if (!supplier) return { success: false, error: "Supplier not found" };
    if (supplier.status === "SUSPENDED" || supplier.status === "BLACKLISTED") {
      return {
        success: false,
        blockedByPolicy: `BLOCKED BY POLICY: Supplier ${supplier.name} is ${supplier.status}. Cannot place purchase order.`,
      };
    }

    const poId = `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    const items: SupplyChainPurchaseOrderItem[] = params.items.map((i, idx) => ({
      ...i,
      itemId: `POI-${poId}-${idx + 1}`,
      poId,
      quantityConfirmed: 0,
      quantityShipped: 0,
      quantityReceived: 0,
      receivedTotal: 0,
      lineTotal: i.quantityOrdered * i.unitPrice,
      status: "PENDING",
    }));

    const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);

    // Supplier minimum order value check
    if (supplier.minimumOrderValue > 0 && totalAmount < supplier.minimumOrderValue) {
      return {
        success: false,
        blockedByPolicy: `BLOCKED BY POLICY: Total PO amount ${totalAmount} ${supplier.currency} is below supplier minimum order value ${supplier.minimumOrderValue} ${supplier.currency}`,
      };
    }

    const po: SupplyChainPurchaseOrder = {
      poId,
      tenantId: params.tenantId,
      branchId: params.branchId,
      warehouseId: params.warehouseId,
      poNumber: params.poNumber,
      supplierId: params.supplierId,
      status: "DRAFT",
      currency: supplier.currency,
      totalAmount,
      items,
      requisitionRef: params.requisitionRef,
      expectedDeliveryDate: params.expectedDeliveryDate,
      paymentTermsDays: supplier.paymentTermsDays,
      createdBy: params.createdBy,
      idempotencyKey: params.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    this.purchaseOrders.set(poId, po);
    this._writeAudit(params.tenantId, "PO_CREATED", params.createdBy, poId,
      `PO Created: ${po.poNumber} with ${items.length} items, total ${totalAmount} ${po.currency}`);

    return { success: true, po };
  }

  public approvePurchaseOrder(poId: string, approvalRef: string, approvedBy: string): {
    success: boolean; error?: string;
  } {
    const po = this.purchaseOrders.get(poId);
    if (!po) return { success: false, error: "Purchase order not found" };
    if (po.status !== "DRAFT" && po.status !== "PENDING_APPROVAL") {
      return { success: false, error: `Cannot approve PO in status ${po.status}` };
    }

    po.status = "APPROVED";
    po.approvalRef = approvalRef;
    po.approvedBy = approvedBy;
    po.updatedAt = new Date().toISOString();

    this._writeAudit(po.tenantId, "PO_APPROVED", approvedBy, poId,
      `PO ${po.poNumber} approved via Approval Ref ${approvalRef}`);

    return { success: true };
  }

  public sendPurchaseOrder(poId: string, sentBy: string): { success: boolean; error?: string } {
    const po = this.purchaseOrders.get(poId);
    if (!po) return { success: false, error: "Purchase order not found" };
    if (po.status !== "APPROVED") {
      return { success: false, error: "BLOCKED BY POLICY: Only APPROVED purchase orders can be sent to suppliers." };
    }

    const now = new Date().toISOString();
    po.status = "SENT";
    po.sentAt = now;
    po.updatedAt = now;

    this._writeAudit(po.tenantId, "PO_SENT", sentBy, poId, `PO ${po.poNumber} sent to supplier`);
    return { success: true };
  }

  public getPurchaseOrder(poId: string): SupplyChainPurchaseOrder | undefined {
    return this.purchaseOrders.get(poId);
  }

  // ─────────────────────────────────────────────────────────
  // 4. Inbound Shipment & Receiving Workflow
  // ─────────────────────────────────────────────────────────

  public trackShipment(shipment: Omit<InboundShipment, "createdAt" | "updatedAt">): {
    success: boolean; shipment?: InboundShipment; error?: string;
  } {
    const po = this.purchaseOrders.get(shipment.poId);
    if (!po) return { success: false, error: "Associated purchase order not found" };

    const now = new Date().toISOString();
    const delayDays = Math.max(0, Math.round(
      (new Date(shipment.supplierEta).getTime() - new Date(po.expectedDeliveryDate).getTime()) / 86400000
    ));

    const record: InboundShipment = {
      ...shipment,
      etaDelayDays: delayDays,
      createdAt: now,
      updatedAt: now,
    };

    this.shipments.set(shipment.shipmentId, record);
    this._writeAudit(shipment.tenantId, "SHIPMENT_TRACKED", "SYSTEM", shipment.shipmentId,
      `Shipment tracked for PO ${po.poNumber}: Carrier ${shipment.carrierName}, Status: ${shipment.status}`);

    return { success: true, shipment: record };
  }

  public processGoodsReceiving(params: {
    tenantId: string;
    poId: string;
    shipmentId?: string;
    warehouseId: string;
    receivedBy: string;
    lines: Omit<ReceivingLine, "receivingLineId" | "receivingId">[];
  }): { success: boolean; receivingRecord?: GoodsReceivingRecord; error?: string } {
    const po = this.purchaseOrders.get(params.poId);
    if (!po) return { success: false, error: "Purchase order not found" };
    if (!["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "APPROVED"].includes(po.status)) {
      return { success: false, error: `Cannot receive goods for PO in status ${po.status}` };
    }

    const receivingId = `REC-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const now = new Date().toISOString();
    let hasExceptions = false;

    const lines: ReceivingLine[] = params.lines.map((l, idx) => {
      if (l.quantityRejected > 0 || l.quantityAccepted < l.quantityExpected) {
        hasExceptions = true;
      }
      return {
        ...l,
        receivingLineId: `RECL-${receivingId}-${idx + 1}`,
        receivingId,
      };
    });

    // Update PO item quantity received & PO status
    lines.forEach(l => {
      const poItem = po.items.find(i => i.itemId === l.poItemId);
      if (poItem) {
        poItem.quantityReceived += l.quantityAccepted;
        poItem.receivedTotal = poItem.quantityReceived * poItem.unitPrice;
        if (poItem.quantityReceived >= poItem.quantityOrdered) {
          poItem.status = "RECEIVED";
        } else {
          poItem.status = "PARTIALLY_RECEIVED";
        }
      }
    });

    const allReceived = po.items.every(i => i.status === "RECEIVED");
    po.status = allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";
    if (allReceived) po.actualDeliveryDate = now.slice(0, 10);
    po.updatedAt = now;

    const record: GoodsReceivingRecord = {
      receivingId,
      tenantId: params.tenantId,
      poId: params.poId,
      shipmentId: params.shipmentId,
      warehouseId: params.warehouseId,
      receivedDate: now,
      receivedBy: params.receivedBy,
      lines,
      hasExceptions,
      exceptionSummary: hasExceptions ? "Receiving variances / rejected items detected" : undefined,
      postedToInventory: true,
      stockLedgerRef: `STK-REC-${receivingId}`,
      threeWayMatchStatus: "NOT_STARTED",
      createdAt: now,
    };

    this.receivingRecords.set(receivingId, record);
    this._writeAudit(params.tenantId, "GOODS_RECEIVED", params.receivedBy, receivingId,
      `Goods received for PO ${po.poNumber}: ${lines.length} lines. Exceptions: ${hasExceptions}`);

    return { success: true, receivingRecord: record };
  }

  // ─────────────────────────────────────────────────────────
  // 5. Three-Way Matching (PO * Goods Receipt * Invoice)
  // ─────────────────────────────────────────────────────────

  public performThreeWayMatch(params: {
    tenantId: string;
    poId: string;
    receivingId: string;
    invoiceRef: string;
    invoiceAmount: number;
    approvedBy?: string;
  }): { success: boolean; matchRecord?: ThreeWayMatchRecord; error?: string } {
    const po = this.purchaseOrders.get(params.poId);
    if (!po) return { success: false, error: "Purchase order not found" };

    const receiving = this.receivingRecords.get(params.receivingId);
    if (!receiving) return { success: false, error: "Receiving record not found" };

    const poAmount = po.totalAmount;
    const receivedAmount = receiving.lines.reduce((s, l) => s + (l.quantityAccepted * l.unitCost), 0);
    const invoiceAmount = params.invoiceAmount;

    const priceVariance = invoiceAmount - receivedAmount;
    const quantityVariance = receiving.lines.reduce((s, l) => s + (l.quantityExpected - l.quantityAccepted), 0);

    let status: ThreeWayMatchRecord["status"] = "PERFECT_MATCH";
    if (Math.abs(priceVariance) > 0.01 && Math.abs(priceVariance) < poAmount * 0.02) {
      status = "VARIANCE_TOLERATED";
    } else if (priceVariance >= poAmount * 0.02) {
      status = "PRICE_MISMATCH";
    }

    if (quantityVariance > 0) {
      status = "QUANTITY_MISMATCH";
    }

    const matchRecord: ThreeWayMatchRecord = {
      matchId: `3WM-${Date.now()}`,
      tenantId: params.tenantId,
      poId: params.poId,
      receivingId: params.receivingId,
      invoiceRef: params.invoiceRef,
      poAmount,
      receivedAmount,
      invoiceAmount,
      priceVariance,
      quantityVariance,
      status,
      matchedAt: new Date().toISOString(),
      approvedBy: params.approvedBy,
    };

    receiving.threeWayMatchStatus = status;
    this.threeWayMatches.set(matchRecord.matchId, matchRecord);
    this._writeAudit(params.tenantId, "THREE_WAY_MATCHED", params.approvedBy ?? "SYSTEM", matchRecord.matchId,
      `Three-way match completed: ${status}, Invoice ${params.invoiceRef}, price var: ${priceVariance.toFixed(2)}`);

    return { success: true, matchRecord };
  }

  // ─────────────────────────────────────────────────────────
  // 6. Replenishment Engine & Safety Stock
  // ─────────────────────────────────────────────────────────

  public generateReplenishmentRecommendation(params: {
    tenantId: string;
    branchId?: string;
    warehouseId?: string;
    productId: string;
    currentStock: number;
    inboundStock?: number;
    averageDailyDemand: number;
    aiAssisted?: boolean;
  }): ReplenishmentRecommendation {
    const profile = this.productProfiles.get(params.productId) ?? {
      productId: params.productId,
      tenantId: params.tenantId,
      primarySupplierId: "SUP-DEFAULT",
      leadTimeDays: 7,
      minimumOrderQuantity: 1,
      reorderPoint: 10,
      safetyStock: 5,
      orderMultiple: 1,
      unitCostPrice: 1000,
      replenishmentPolicy: "REORDER_POINT",
      sourcingCountry: "TZ",
      updatedAt: new Date().toISOString(),
    };

    const inbound = params.inboundStock ?? 0;
    const expectedDemand = params.averageDailyDemand * profile.leadTimeDays;
    const projectedAvailableStock = params.currentStock + inbound - expectedDemand - profile.safetyStock;

    // Formula: Recommended Qty = Math.max(0, (Reorder Point + Safety Stock) - (Current Stock + Inbound))
    let rawQty = (profile.reorderPoint + profile.safetyStock) - (params.currentStock + inbound);
    let recommendedQuantity = Math.max(0, Math.ceil(rawQty / profile.orderMultiple) * profile.orderMultiple);
    recommendedQuantity = Math.max(recommendedQuantity, profile.minimumOrderQuantity);

    let urgency: ReplenishmentRecommendation["urgency"] = "LOW";
    if (params.currentStock <= profile.safetyStock) urgency = "CRITICAL";
    else if (params.currentStock <= profile.reorderPoint) urgency = "HIGH";
    else if (projectedAvailableStock <= profile.reorderPoint) urgency = "MEDIUM";

    const rec: ReplenishmentRecommendation = {
      recommendationId: `REP-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      tenantId: params.tenantId,
      branchId: params.branchId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      currentStock: params.currentStock,
      inboundStock: inbound,
      expectedDemand,
      safetyStock: profile.safetyStock,
      projectedAvailableStock,
      reorderPoint: profile.reorderPoint,
      recommendedQuantity,
      preferredSupplierId: profile.primarySupplierId,
      estimatedCost: recommendedQuantity * profile.unitCostPrice,
      urgency,
      source: params.aiAssisted ? "AI_PREDICTIVE" : "AUTOMATED_ENGINE",
      reason: `Stock level ${params.currentStock} is below reorder threshold ${profile.reorderPoint}. Lead time: ${profile.leadTimeDays}d`,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    this.replenishmentRecs.set(rec.recommendationId, rec);
    this._writeAudit(params.tenantId, "REPLENISHMENT_RECOMMENDED", "SYSTEM", rec.recommendationId,
      `Replenishment recommended: ${recommendedQuantity} units for product ${params.productId} (${urgency})`);

    return rec;
  }

  // ─────────────────────────────────────────────────────────
  // 7. Demand Forecasting Engine
  // ─────────────────────────────────────────────────────────

  public generateDemandForecast(params: {
    tenantId: string;
    branchId?: string;
    productId: string;
    scenario: DemandForecast["scenario"];
    horizonDays: number;
    historicalBaselineDailyDemand: number;
    seasonalityFactor?: number;
    promotionImpactPct?: number;
    aiAssisted?: boolean;
  }): DemandForecast {
    const scenarioMultipliers: Record<string, number> = {
      BASE: 1.0,
      GROWTH: 1.25,
      SHORTAGE: 0.8,
      DISRUPTION: 0.5,
      PRICE_SHOCK: 0.7,
      EXPANSION: 1.4,
    };
    const mult = scenarioMultipliers[params.scenario] ?? 1.0;
    const seasonality = params.seasonalityFactor ?? 1.0;
    const promo = 1.0 + ((params.promotionImpactPct ?? 0) / 100);

    const expectedDailyDemand = params.historicalBaselineDailyDemand * mult * seasonality * promo;
    const confidenceScore = params.scenario === "BASE" ? 0.9 : params.scenario === "GROWTH" ? 0.8 : 0.65;
    const confidence = confidenceScore >= 0.85 ? "HIGH" : confidenceScore >= 0.7 ? "MEDIUM" : "LOW";

    const forecast: DemandForecast = {
      forecastId: `FST-${Date.now()}`,
      tenantId: params.tenantId,
      branchId: params.branchId,
      productId: params.productId,
      scenario: params.scenario,
      horizonDays: params.horizonDays,
      expectedDailyDemand: Math.round(expectedDailyDemand * 10) / 10,
      confidence,
      confidenceScore,
      historicalBaseline: params.historicalBaselineDailyDemand,
      seasonalityFactor: seasonality,
      promotionImpactPct: params.promotionImpactPct ?? 0,
      aiAssisted: params.aiAssisted ?? false,
      generatedAt: new Date().toISOString(),
    };

    this.demandForecasts.set(forecast.forecastId, forecast);
    this._writeAudit(params.tenantId, "AI_FORECAST_GENERATED", "SYSTEM", forecast.forecastId,
      `Demand forecast generated: ${forecast.scenario} scenario, ${expectedDailyDemand.toFixed(1)} units/day`);

    return forecast;
  }

  // ─────────────────────────────────────────────────────────
  // 8. Inventory Balancing & Multi-Branch Transfer
  // ─────────────────────────────────────────────────────────

  public recommendInventoryBalancing(params: {
    tenantId: string;
    productId: string;
    sourceBranchId: string;
    targetBranchId: string;
    sourceCurrentStock: number;
    targetCurrentStock: number;
    targetReorderPoint: number;
    unitCostPrice: number;
  }): InventoryBalancingRecommendation | undefined {
    // Only balance if source has excess (> 2x target ROP) and target is in deficit
    if (params.targetCurrentStock >= params.targetReorderPoint || params.sourceCurrentStock <= params.targetReorderPoint * 2) {
      return undefined;
    }

    const recommendedTransferQty = Math.min(
      Math.floor(params.sourceCurrentStock / 2),
      params.targetReorderPoint - params.targetCurrentStock + 5
    );

    const costSavingsVsNewPurchase = recommendedTransferQty * params.unitCostPrice * 0.15; // 15% freight/holding savings

    const rec: InventoryBalancingRecommendation = {
      transferId: `BAL-${Date.now()}`,
      tenantId: params.tenantId,
      productId: params.productId,
      sourceBranchId: params.sourceBranchId,
      targetBranchId: params.targetBranchId,
      sourceCurrentStock: params.sourceCurrentStock,
      targetCurrentStock: params.targetCurrentStock,
      recommendedTransferQty,
      costSavingsVsNewPurchase,
      urgency: params.targetCurrentStock <= 2 ? "CRITICAL" : "HIGH",
      status: "RECOMMENDED",
      createdAt: new Date().toISOString(),
    };

    this.balancingRecs.set(rec.transferId, rec);
    this._writeAudit(params.tenantId, "BALANCING_RECOMMENDED", "SYSTEM", rec.transferId,
      `Inventory balancing: Transfer ${recommendedTransferQty} units from Branch ${params.sourceBranchId} to ${params.targetBranchId}`);

    return rec;
  }

  // ─────────────────────────────────────────────────────────
  // 9. Control Tower Observability & Risk
  // ─────────────────────────────────────────────────────────

  public getControlTowerMetrics(tenantId: string): SupplyChainControlTowerMetrics {
    const tenantSuppliers = Array.from(this.suppliers.values()).filter(s => s.tenantId === tenantId);
    const tenantPOs = Array.from(this.purchaseOrders.values())
      .filter(p => p.tenantId === tenantId && !["CLOSED", "CANCELLED"].includes(p.status));
    const tenantShipments = Array.from(this.shipments.values())
      .filter(s => s.tenantId === tenantId && !["RECEIVED", "CANCELLED"].includes(s.status));
    const tenantReceivings = Array.from(this.receivingRecords.values())
      .filter(r => r.tenantId === tenantId && r.hasExceptions);

    const otdAvg = tenantSuppliers.length > 0
      ? tenantSuppliers.reduce((s, sup) => s + (sup.scorecard?.onTimeDeliveryRatePct ?? 95), 0) / tenantSuppliers.length
      : 95;
    const fillAvg = tenantSuppliers.length > 0
      ? tenantSuppliers.reduce((s, sup) => s + (sup.scorecard?.fillRatePct ?? 95), 0) / tenantSuppliers.length
      : 95;
    const healthAvg = tenantSuppliers.length > 0
      ? tenantSuppliers.reduce((s, sup) => s + (sup.scorecard?.healthScore ?? 90), 0) / tenantSuppliers.length
      : 90;

    let riskLevel: SupplyRiskLevel = "LOW";
    if (tenantReceivings.length > 2 || otdAvg < 85) riskLevel = "MEDIUM";
    if (tenantReceivings.length > 5 || otdAvg < 70) riskLevel = "HIGH";
    if (otdAvg < 55) riskLevel = "CRITICAL";

    return {
      tenantId,
      calculatedAt: new Date().toISOString(),
      totalSuppliers: tenantSuppliers.length,
      activePurchaseOrders: tenantPOs.length,
      inboundShipmentsCount: tenantShipments.length,
      pendingReceivingsCount: tenantReceivings.length,
      activeExceptionsCount: tenantReceivings.length,
      stockoutRiskProductCount: Array.from(this.replenishmentRecs.values())
        .filter(r => r.tenantId === tenantId && r.urgency === "CRITICAL").length,
      excessInventoryProductCount: 0,
      overallFillRatePct: Math.round(fillAvg),
      overallOnTimeDeliveryPct: Math.round(otdAvg),
      overallInventoryHealthScore: Math.round(healthAvg),
      supplyChainRiskLevel: riskLevel,
      engineOperational: true,
    };
  }

  public getAuditTrail(tenantId: string): SupplyChainAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  // ─────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────

  private _writeAudit(tenantId: string, eventType: SupplyChainAuditEntry["eventType"], actorId: string, relatedRef?: string, details?: string): void {
    this.auditLedger.push({
      auditId: `SCAUD-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      tenantId,
      eventType,
      actorId,
      relatedRef,
      details: details ?? eventType,
      timestamp: new Date().toISOString(),
    });
  }

  private _seedDefaultCentralWarehouse(): void {
    this.warehouses.set("WH-CENTRAL-01", {
      warehouseId: "WH-CENTRAL-01",
      tenantId: "DEFAULT",
      code: "WH-CTR-01",
      name: "Central Logistics Warehouse",
      isCentral: true,
      totalCapacity: 100000,
      usedCapacity: 25000,
      locations: [{
        locationId: "LOC-A1", warehouseId: "WH-CENTRAL-01",
        zone: "A", aisle: "01", bin: "B1", code: "A-01-B1",
        capacityUnits: 1000, currentUnits: 250, isPickable: true, isReceivingZone: false,
      }],
      isActive: true,
    });
  }
}

export const globalSupplyChainEngine = new SupplyChainEngine();
