import { z } from "zod";

export const AiEvidenceClassEnum=z.enum(["MEASURED","CALCULATED","ESTIMATED","PREDICTED","RECOMMENDED"]);
export type AiEvidenceClass=z.infer<typeof AiEvidenceClassEnum>;
export const AiEvidenceItemSchema=z.object({
  sourceType:z.enum(["PRODUCT_VARIANT","STOCK_LEDGER","SALE_LINE","BI_METRIC"]),
  sourceId:z.string(), label:z.string(),
  value:z.union([z.string(),z.number(),z.boolean()]).optional(),
  observedAt:z.string(), evidenceClass:AiEvidenceClassEnum,
});
export type AiEvidenceItem=z.infer<typeof AiEvidenceItemSchema>;
export const AiInsightRecordSchema=z.object({
  insightId:z.string(),tenantId:z.string(),branchId:z.string(),dedupeKey:z.string(),
  title:z.string(),observation:z.string(),evidence:z.array(AiEvidenceItemSchema),
  interpretation:z.string(),impact:z.string(),recommendedNextStep:z.string(),
  confidenceScore:z.number().min(0).max(1),evidenceClass:AiEvidenceClassEnum,
  sourceKind:z.enum(["DETERMINISTIC_RULE","BI_SEMANTIC_METRIC"]),sourceMetricId:z.string().optional(),
  status:z.enum(["ACTIVE","STALE","RESOLVED"]),createdAt:z.string(),updatedAt:z.string(),
});
export type AiInsightRecord=z.infer<typeof AiInsightRecordSchema>;
export const AiRecommendationSchema=z.object({
  recommendationId:z.string(),tenantId:z.string(),branchId:z.string(),insightId:z.string().optional(),
  title:z.string(),summary:z.string(),evidence:z.array(AiEvidenceItemSchema),expectedImpact:z.string(),
  riskLevel:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]),policyStatus:z.enum(["VALIDATED","REJECTED"]),
  approvalStatus:z.enum(["PENDING","APPROVED","REJECTED","EXPIRED"]),
  approvedByUserId:z.string().optional(),approvedAt:z.string().optional(),expiresAt:z.string().optional(),
  createdAt:z.string(),updatedAt:z.string(),
});
export type AiRecommendation=z.infer<typeof AiRecommendationSchema>;
export const AiActionLedgerRecordSchema=z.object({
  ledgerId:z.string(),tenantId:z.string(),branchId:z.string(),recommendationId:z.string(),
  eventType:z.enum(["CREATED","APPROVED","REJECTED","EXECUTED","VERIFIED","FAILED"]),
  actionExecuted:z.string(),executedByIdentity:z.string(),executionVerified:z.boolean(),
  verificationDetails:z.string(),timestamp:z.string(),
});
export type AiActionLedgerRecord=z.infer<typeof AiActionLedgerRecordSchema>;
export const AiOperatingHealthSummarySchema=z.object({
  tenantId:z.string(),branchId:z.string(),activeInsightsCount:z.number().int().nonnegative(),
  pendingApprovalsCount:z.number().int().nonnegative(),approvedRecommendationsCount:z.number().int().nonnegative(),
  ledgerEntriesCount:z.number().int().nonnegative(),killSwitchActive:z.boolean(),
  dataGrounded:z.boolean(),aiPlatformOperational:z.boolean(),
});
export type AiOperatingHealthSummary=z.infer<typeof AiOperatingHealthSummarySchema>;
export const AiBusinessSnapshotSchema=z.object({
  now:z.string(),
  variants:z.array(z.object({
    variantId:z.string(),productId:z.string(),productName:z.string(),sku:z.string(),
    inventoryQuantity:z.number(),reservedQuantity:z.number(),reorderLevel:z.number(),
    sellingPrice:z.number(),costPrice:z.number(),active:z.boolean(),
  })),
  stockByVariant:z.record(z.number()),unitsSoldLast7DaysByVariant:z.record(z.number()),salesDaysByVariant:z.record(z.number()),
});
export type AiBusinessSnapshot=z.infer<typeof AiBusinessSnapshotSchema>;
export interface AiSemanticMetricResult{metricId:string;metricName:string;calculatedValue:number;evidence:AiEvidenceItem[];}
export const AiKillSwitchScopeEnum=z.enum(["GLOBAL","TENANT"]);
export type AiKillSwitchScope=z.infer<typeof AiKillSwitchScopeEnum>;
