import { globalSupplyChainEngine } from "@kwakopos2/domain";
import type { SupplyChainSupplier, ProductSupplyProfile, InboundShipment } from "@kwakopos2/contracts";

// ============================================================
// Phase 36 — Supply Chain API Service
// ============================================================

export class SupplyChainService {
  public registerSupplier(params: Omit<SupplyChainSupplier, "createdAt" | "updatedAt">) {
    return globalSupplyChainEngine.registerSupplier(params);
  }
  public getSupplier(supplierId: string) {
    return globalSupplyChainEngine.getSupplier(supplierId);
  }
  public listSuppliers(tenantId: string) {
    return globalSupplyChainEngine.listSuppliers(tenantId);
  }

  public calculateSupplierScorecard(params: {
    supplierId: string; onTimeDeliveryRatePct: number; fillRatePct: number;
    qualityRatePct: number; priceVariancePct: number; returnRatePct: number;
    leadTimeAccuracyPct: number; disputeCount?: number;
  }) {
    return globalSupplyChainEngine.calculateSupplierScorecard(params);
  }

  public setProductSupplyProfile(profile: ProductSupplyProfile) {
    return globalSupplyChainEngine.setProductSupplyProfile(profile);
  }
  public getProductSupplyProfile(productId: string) {
    return globalSupplyChainEngine.getProductSupplyProfile(productId);
  }

  public createPurchaseOrder(params: {
    tenantId: string; branchId?: string; warehouseId?: string; poNumber: string;
    supplierId: string; expectedDeliveryDate: string; items: any[]; createdBy: string;
    idempotencyKey: string; requisitionRef?: string;
  }) {
    return globalSupplyChainEngine.createPurchaseOrder(params);
  }

  public approvePurchaseOrder(poId: string, approvalRef: string, approvedBy: string) {
    return globalSupplyChainEngine.approvePurchaseOrder(poId, approvalRef, approvedBy);
  }

  public sendPurchaseOrder(poId: string, sentBy: string) {
    return globalSupplyChainEngine.sendPurchaseOrder(poId, sentBy);
  }

  public getPurchaseOrder(poId: string) {
    return globalSupplyChainEngine.getPurchaseOrder(poId);
  }

  public trackShipment(shipment: Omit<InboundShipment, "createdAt" | "updatedAt">) {
    return globalSupplyChainEngine.trackShipment(shipment);
  }

  public processGoodsReceiving(params: {
    tenantId: string; poId: string; shipmentId?: string; warehouseId: string;
    receivedBy: string; lines: any[];
  }) {
    return globalSupplyChainEngine.processGoodsReceiving(params);
  }

  public performThreeWayMatch(params: {
    tenantId: string; poId: string; receivingId: string; invoiceRef: string;
    invoiceAmount: number; approvedBy?: string;
  }) {
    return globalSupplyChainEngine.performThreeWayMatch(params);
  }

  public generateReplenishmentRecommendation(params: {
    tenantId: string; branchId?: string; warehouseId?: string; productId: string;
    currentStock: number; inboundStock?: number; averageDailyDemand: number; aiAssisted?: boolean;
  }) {
    return globalSupplyChainEngine.generateReplenishmentRecommendation(params);
  }

  public generateDemandForecast(params: {
    tenantId: string; branchId?: string; productId: string; scenario: any;
    horizonDays: number; historicalBaselineDailyDemand: number;
    seasonalityFactor?: number; promotionImpactPct?: number; aiAssisted?: boolean;
  }) {
    return globalSupplyChainEngine.generateDemandForecast(params);
  }

  public recommendInventoryBalancing(params: {
    tenantId: string; productId: string; sourceBranchId: string; targetBranchId: string;
    sourceCurrentStock: number; targetCurrentStock: number; targetReorderPoint: number;
    unitCostPrice: number;
  }) {
    return globalSupplyChainEngine.recommendInventoryBalancing(params);
  }

  public getDashboardMetrics(tenantId: string) {
    return globalSupplyChainEngine.getControlTowerMetrics(tenantId);
  }

  public getAuditTrail(tenantId: string) {
    return globalSupplyChainEngine.getAuditTrail(tenantId);
  }
}

export const globalSupplyChainService = new SupplyChainService();
