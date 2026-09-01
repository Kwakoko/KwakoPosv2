import { z } from "zod";

export const RetailModuleManifestSchema = z.object({
  moduleId: z.literal("retail_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedScales: z.array(z.enum(["SINGLE_STORE", "MULTI_BRANCH", "REGIONAL", "ENTERPRISE"])),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type RetailModuleManifest = z.infer<typeof RetailModuleManifestSchema>;

export const RetailSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  taxRatePct: z.number().default(18.0),
  taxInclusivePricing: z.boolean().default(true),
  allowNegativeStock: z.boolean().default(false),
  requireReceiptForReturn: z.boolean().default(true),
  maxDiscountPctWithoutApproval: z.number().default(15.0),
  skuPrefix: z.string().default("RET-"),
  barcodeFormat: z.enum(["EAN13", "UPC", "CODE128", "QR"]).default("CODE128"),
  stockValuationMethod: z.enum(["FIFO", "WEIGHTED_AVERAGE"]).default("FIFO"),
  receiptHeader: z.string().default("KwakoPos Retail Store"),
  receiptFooter: z.string().default("Thank you for shopping with us!"),
});
export type RetailSettings = z.infer<typeof RetailSettingsSchema>;

export const RetailPromotionTypeEnum = z.enum([
  "PERCENTAGE_DISCOUNT",
  "FIXED_AMOUNT_DISCOUNT",
  "BUY_X_GET_Y",
  "QUANTITY_VOLUME_DISCOUNT",
]);
export type RetailPromotionType = z.infer<typeof RetailPromotionTypeEnum>;

export const RetailPromotionSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  name: z.string(),
  type: RetailPromotionTypeEnum,
  discountValue: z.number(),
  buyQuantity: z.number().optional(),
  getQuantity: z.number().optional(),
  minOrderAmount: z.number().optional(),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  isActive: z.boolean().default(true),
  requiredRoleToApply: z.string().optional(),
});
export type RetailPromotion = z.infer<typeof RetailPromotionSchema>;

export const RetailReplenishmentSuggestionSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  currentStock: z.number(),
  reorderLevel: z.number(),
  salesVelocityPerDay: z.number(),
  leadTimeDays: z.number(),
  safetyStock: z.number(),
  suggestedReorderQuantity: z.number(),
  estimatedCostTzs: z.number(),
  preferredSupplierId: z.string().uuid().optional(),
});
export type RetailReplenishmentSuggestion = z.infer<typeof RetailReplenishmentSuggestionSchema>;

export const RetailAiRecommendationSchema = z.object({
  recommendationId: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "STOCKOUT_PREDICTION",
    "SLOW_MOVING_DEAD_STOCK",
    "ABNORMAL_DISCOUNT",
    "MARGIN_EROSION",
    "REORDER_OPPORTUNITY",
    "DEMAND_FORECAST",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type RetailAiRecommendation = z.infer<typeof RetailAiRecommendationSchema>;

export const RetailAuditEventSchema = z.object({
  eventId: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  userId: z.string().uuid(),
  deviceId: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  beforeState: z.record(z.any()).optional(),
  afterState: z.record(z.any()).optional(),
  reason: z.string().optional(),
  timestamp: z.string().or(z.date()),
});
export type RetailAuditEvent = z.infer<typeof RetailAuditEventSchema>;

export const RetailCertificationEvaluationSchema = z.object({
  pillarId: z.number(),
  pillarName: z.string(),
  passed: z.boolean(),
  details: z.string(),
});
export type RetailCertificationEvaluation = z.infer<typeof RetailCertificationEvaluationSchema>;

export const RetailEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  evaluations: z.array(RetailCertificationEvaluationSchema),
  digest: z.string(),
});
export type RetailEvidencePackage = z.infer<typeof RetailEvidencePackageSchema>;
