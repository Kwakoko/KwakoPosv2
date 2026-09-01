import { z } from "zod";

// ============================================================
// Phase 36 — Supply Chain Contracts (KSCOL v1.0.0)
// ============================================================

// ─── 1. Enumerations ─────────────────────────────────────────

export const SupplyChainSupplierTypeEnum = z.enum([
  "MANUFACTURER", "DISTRIBUTOR", "WHOLESALER", "IMPORTER", "LOCAL_FARMER", "SERVICE_PROVIDER", "OTHER",
]);
export type SupplyChainSupplierType = z.infer<typeof SupplyChainSupplierTypeEnum>;

export const SupplyChainSupplierStatusEnum = z.enum([
  "ACTIVE", "INACTIVE", "PROBATION", "SUSPENDED", "BLACKLISTED", "PENDING_VERIFICATION",
]);
export type SupplyChainSupplierStatus = z.infer<typeof SupplyChainSupplierStatusEnum>;

export const SupplierTierEnum = z.enum(["PRIMARY", "SECONDARY", "EMERGENCY", "BACKUP"]);
export type SupplierTier = z.infer<typeof SupplierTierEnum>;

export const PurchaseRequisitionStatusEnum = z.enum([
  "DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED", "CONVERTED_TO_PO",
]);
export type PurchaseRequisitionStatus = z.infer<typeof PurchaseRequisitionStatusEnum>;

export const PurchaseOrderStatusEnum = z.enum([
  "DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACKNOWLEDGED",
  "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED", "REJECTED",
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

export const ShipmentStatusEnum = z.enum([
  "PLANNED", "CONFIRMED", "IN_TRANSIT", "ARRIVED", "RECEIVING", "RECEIVED", "EXCEPTION", "CANCELLED",
]);
export type ShipmentStatus = z.infer<typeof ShipmentStatusEnum>;

export const ReceivingExceptionTypeEnum = z.enum([
  "SHORT_SHIPMENT", "OVER_SHIPMENT", "DAMAGED_GOODS", "WRONG_ITEM",
  "EXPIRED_GOODS", "QUALITY_FAILURE", "MISSING_DOCUMENTATION", "PRICE_VARIANCE",
]);
export type ReceivingExceptionType = z.infer<typeof ReceivingExceptionTypeEnum>;

export const ThreeWayMatchStatusEnum = z.enum([
  "NOT_STARTED", "PERFECT_MATCH", "VARIANCE_TOLERATED", "PRICE_MISMATCH",
  "QUANTITY_MISMATCH", "UNMATCHED_INVOICE", "EXCEPTION",
]);
export type ThreeWayMatchStatus = z.infer<typeof ThreeWayMatchStatusEnum>;

export const ReplenishmentPolicyEnum = z.enum([
  "REORDER_POINT", "MIN_MAX", "EOQ", "PERIODIC_REVIEW", "JUST_IN_TIME", "MANUAL",
]);
export type ReplenishmentPolicy = z.infer<typeof ReplenishmentPolicyEnum>;

export const DemandForecastScenarioEnum = z.enum([
  "BASE", "GROWTH", "SHORTAGE", "DISRUPTION", "PRICE_SHOCK", "EXPANSION",
]);
export type DemandForecastScenario = z.infer<typeof DemandForecastScenarioEnum>;

export const SupplyRiskLevelEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type SupplyRiskLevel = z.infer<typeof SupplyRiskLevelEnum>;

// ─── 2. Supplier Master & Scorecard ──────────────────────────

export const SupplierScorecardSchema = z.object({
  supplierId: z.string(),
  calculatedAt: z.string(),
  onTimeDeliveryRatePct: z.number().min(0).max(100),
  fillRatePct: z.number().min(0).max(100),
  qualityRatePct: z.number().min(0).max(100),
  priceVariancePct: z.number(),
  returnRatePct: z.number().min(0).max(100),
  leadTimeAccuracyPct: z.number().min(0).max(100),
  disputeCount: z.number().int().nonnegative().default(0),
  healthScore: z.number().min(0).max(100),
  ratingCategory: z.enum(["EXCELLENT", "GOOD", "ADEQUATE", "POOR", "CRITICAL"]),
});
export type SupplierScorecard = z.infer<typeof SupplierScorecardSchema>;

export const SupplyChainSupplierSchema = z.object({
  supplierId: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  type: SupplyChainSupplierTypeEnum,
  status: SupplyChainSupplierStatusEnum,
  country: z.string().default("TZ"),
  currency: z.string().default("TZS"),
  paymentTermsDays: z.number().int().nonnegative().default(30),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  minimumOrderValue: z.number().nonnegative().default(0),
  leadTimeDays: z.number().int().nonnegative().default(7),
  scorecard: SupplierScorecardSchema.optional(),
  isPreferred: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SupplyChainSupplier = z.infer<typeof SupplyChainSupplierSchema>;

// ─── 3. Product Supply Profile ───────────────────────────────

export const ProductSupplyProfileSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  tenantId: z.string(),
  primarySupplierId: z.string(),
  alternateSupplierIds: z.array(z.string()).default([]),
  supplierSku: z.string().optional(),
  leadTimeDays: z.number().int().nonnegative().default(7),
  minimumOrderQuantity: z.number().positive().default(1),
  reorderPoint: z.number().nonnegative().default(10),
  safetyStock: z.number().nonnegative().default(5),
  orderMultiple: z.number().positive().default(1),
  procurementUnit: z.string().default("PCS"),
  replenishmentPolicy: ReplenishmentPolicyEnum.default("REORDER_POINT"),
  preferredWarehouseId: z.string().optional(),
  sourcingCountry: z.string().default("TZ"),
  unitCostPrice: z.number().nonnegative(),
  lastPriceUpdate: z.string().optional(),
  updatedAt: z.string(),
});
export type ProductSupplyProfile = z.infer<typeof ProductSupplyProfileSchema>;

// ─── 4. Purchase Requisition & Purchase Order ───────────────

export const SupplyChainPurchaseOrderItemSchema = z.object({
  itemId: z.string(),
  poId: z.string(),
  productId: z.string(),
  variantId: z.string().optional(),
  sku: z.string(),
  description: z.string(),
  quantityOrdered: z.number().positive(),
  quantityConfirmed: z.number().nonnegative().default(0),
  quantityShipped: z.number().nonnegative().default(0),
  quantityReceived: z.number().nonnegative().default(0),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  receivedTotal: z.number().nonnegative().default(0),
  status: z.enum(["PENDING", "CONFIRMED", "SHIPPED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]),
});
export type SupplyChainPurchaseOrderItem = z.infer<typeof SupplyChainPurchaseOrderItemSchema>;

export const SupplyChainPurchaseOrderSchema = z.object({
  poId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  warehouseId: z.string().optional(),
  poNumber: z.string(),
  supplierId: z.string(),
  status: PurchaseOrderStatusEnum,
  currency: z.string().default("TZS"),
  totalAmount: z.number().nonnegative(),
  items: z.array(SupplyChainPurchaseOrderItemSchema).default([]),
  requisitionRef: z.string().optional(),
  approvalRef: z.string().optional(),
  expectedDeliveryDate: z.string(),
  actualDeliveryDate: z.string().optional(),
  paymentTermsDays: z.number().int().nonnegative().default(30),
  notes: z.string().optional(),
  createdBy: z.string(),
  approvedBy: z.string().optional(),
  sentAt: z.string().optional(),
  idempotencyKey: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SupplyChainPurchaseOrder = z.infer<typeof SupplyChainPurchaseOrderSchema>;

// ─── 5. Inbound Shipment & Receiving ─────────────────────────

export const ReceivingLineSchema = z.object({
  receivingLineId: z.string(),
  receivingId: z.string(),
  poItemId: z.string(),
  productId: z.string(),
  quantityExpected: z.number().nonnegative(),
  quantityReceived: z.number().nonnegative(),
  quantityAccepted: z.number().nonnegative(),
  quantityRejected: z.number().nonnegative().default(0),
  rejectionReason: ReceivingExceptionTypeEnum.optional(),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  unitCost: z.number().nonnegative(),
});
export type ReceivingLine = z.infer<typeof ReceivingLineSchema>;

export const InboundShipmentSchema = z.object({
  shipmentId: z.string(),
  tenantId: z.string(),
  poId: z.string(),
  supplierId: z.string(),
  carrierName: z.string(),
  trackingNumber: z.string().optional(),
  status: ShipmentStatusEnum,
  supplierEta: z.string(),
  carrierEta: z.string().optional(),
  actualArrivalDate: z.string().optional(),
  destinationWarehouseId: z.string(),
  lines: z.array(z.object({
    productId: z.string(),
    quantityShipped: z.number().positive(),
  })).default([]),
  etaDelayDays: z.number().int().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InboundShipment = z.infer<typeof InboundShipmentSchema>;

export const GoodsReceivingRecordSchema = z.object({
  receivingId: z.string(),
  tenantId: z.string(),
  poId: z.string(),
  shipmentId: z.string().optional(),
  warehouseId: z.string(),
  receivedDate: z.string(),
  receivedBy: z.string(),
  lines: z.array(ReceivingLineSchema).default([]),
  hasExceptions: z.boolean().default(false),
  exceptionSummary: z.string().optional(),
  stockLedgerRef: z.string().optional(),
  postedToInventory: z.boolean().default(false),
  threeWayMatchStatus: ThreeWayMatchStatusEnum.default("NOT_STARTED"),
  createdAt: z.string(),
});
export type GoodsReceivingRecord = z.infer<typeof GoodsReceivingRecordSchema>;

// ─── 6. Three-Way Matching ───────────────────────────────────

export const ThreeWayMatchRecordSchema = z.object({
  matchId: z.string(),
  tenantId: z.string(),
  poId: z.string(),
  receivingId: z.string(),
  invoiceRef: z.string(),
  poAmount: z.number().nonnegative(),
  receivedAmount: z.number().nonnegative(),
  invoiceAmount: z.number().nonnegative(),
  priceVariance: z.number(),
  quantityVariance: z.number(),
  status: ThreeWayMatchStatusEnum,
  matchedAt: z.string(),
  approvedBy: z.string().optional(),
  notes: z.string().optional(),
});
export type ThreeWayMatchRecord = z.infer<typeof ThreeWayMatchRecordSchema>;

// ─── 7. Warehouse & Location Management ───────────────────────

export const WarehouseLocationSchema = z.object({
  locationId: z.string(),
  warehouseId: z.string(),
  zone: z.string(),
  aisle: z.string(),
  bin: z.string(),
  code: z.string(),
  capacityUnits: z.number().positive(),
  currentUnits: z.number().nonnegative().default(0),
  isPickable: z.boolean().default(true),
  isReceivingZone: z.boolean().default(false),
});
export type WarehouseLocation = z.infer<typeof WarehouseLocationSchema>;

export const WarehouseSchema = z.object({
  warehouseId: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  address: z.string().optional(),
  isCentral: z.boolean().default(false),
  totalCapacity: z.number().positive(),
  usedCapacity: z.number().nonnegative().default(0),
  locations: z.array(WarehouseLocationSchema).default([]),
  isActive: z.boolean().default(true),
});
export type Warehouse = z.infer<typeof WarehouseSchema>;

// ─── 8. Demand Forecast & Replenishment ───────────────────────

export const ReplenishmentRecommendationSchema = z.object({
  recommendationId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  warehouseId: z.string().optional(),
  productId: z.string(),
  variantId: z.string().optional(),
  currentStock: z.number().nonnegative(),
  inboundStock: z.number().nonnegative(),
  expectedDemand: z.number().nonnegative(),
  safetyStock: z.number().nonnegative(),
  projectedAvailableStock: z.number(),
  reorderPoint: z.number().nonnegative(),
  recommendedQuantity: z.number().positive(),
  preferredSupplierId: z.string(),
  estimatedCost: z.number().nonnegative(),
  urgency: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  source: z.enum(["AUTOMATED_ENGINE", "AI_PREDICTIVE", "MANUAL_REORDER"]),
  reason: z.string(),
  status: z.enum(["PENDING", "APPROVED", "CONVERTED_TO_PO", "DISMISSED"]),
  createdAt: z.string(),
});
export type ReplenishmentRecommendation = z.infer<typeof ReplenishmentRecommendationSchema>;

export const DemandForecastSchema = z.object({
  forecastId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  productId: z.string(),
  scenario: DemandForecastScenarioEnum,
  horizonDays: z.number().int().positive(),
  expectedDailyDemand: z.number().nonnegative(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  confidenceScore: z.number().min(0).max(1),
  historicalBaseline: z.number().nonnegative(),
  seasonalityFactor: z.number().default(1.0),
  promotionImpactPct: z.number().default(0),
  aiAssisted: z.boolean().default(false),
  generatedAt: z.string(),
});
export type DemandForecast = z.infer<typeof DemandForecastSchema>;

// ─── 9. Inventory Balancing & Branch Transfers ───────────────

export const InventoryBalancingRecommendationSchema = z.object({
  transferId: z.string(),
  tenantId: z.string(),
  productId: z.string(),
  sourceBranchId: z.string(),
  targetBranchId: z.string(),
  sourceCurrentStock: z.number().positive(),
  targetCurrentStock: z.number().nonnegative(),
  recommendedTransferQty: z.number().positive(),
  costSavingsVsNewPurchase: z.number().nonnegative(),
  urgency: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  status: z.enum(["RECOMMENDED", "APPROVED", "EXECUTED", "REJECTED"]),
  createdAt: z.string(),
});
export type InventoryBalancingRecommendation = z.infer<typeof InventoryBalancingRecommendationSchema>;

// ─── 10. Supply Chain Control Tower & Risk ───────────────────

export const SupplyChainControlTowerMetricsSchema = z.object({
  tenantId: z.string(),
  calculatedAt: z.string(),
  totalSuppliers: z.number().int().nonnegative(),
  activePurchaseOrders: z.number().int().nonnegative(),
  inboundShipmentsCount: z.number().int().nonnegative(),
  pendingReceivingsCount: z.number().int().nonnegative(),
  activeExceptionsCount: z.number().int().nonnegative(),
  stockoutRiskProductCount: z.number().int().nonnegative(),
  excessInventoryProductCount: z.number().int().nonnegative(),
  overallFillRatePct: z.number().min(0).max(100),
  overallOnTimeDeliveryPct: z.number().min(0).max(100),
  overallInventoryHealthScore: z.number().min(0).max(100),
  supplyChainRiskLevel: SupplyRiskLevelEnum,
  engineOperational: z.boolean(),
});
export type SupplyChainControlTowerMetrics = z.infer<typeof SupplyChainControlTowerMetricsSchema>;

export const SupplyChainAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "SUPPLIER_REGISTERED", "SCORECARD_UPDATED", "PO_CREATED", "PO_APPROVED",
    "PO_SENT", "PO_RECEIVED", "PO_CLOSED", "SHIPMENT_TRACKED", "GOODS_RECEIVED",
    "RECEIVING_EXCEPTION", "THREE_WAY_MATCHED", "REPLENISHMENT_RECOMMENDED",
    "BALANCING_RECOMMENDED", "POLICY_APPLIED", "AI_FORECAST_GENERATED",
  ]),
  actorId: z.string(),
  relatedRef: z.string().optional(),
  details: z.string(),
  timestamp: z.string(),
});
export type SupplyChainAuditEntry = z.infer<typeof SupplyChainAuditEntrySchema>;
