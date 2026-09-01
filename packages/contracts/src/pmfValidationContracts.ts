import { z } from "zod";

export const PmfVerticalStateSchema = z.enum([
  "PROVEN",
  "PROMISING",
  "VALIDATION_REQUIRED",
  "PRODUCT_GAP",
  "COMMERCIAL_RISK",
  "PAUSED",
]);
export type PmfVerticalState = z.infer<typeof PmfVerticalStateSchema>;

export const InvestmentActionRuleSchema = z.enum([
  "DOUBLE_DOWN",
  "OPTIMIZE",
  "PILOT_MORE",
  "MAINTAIN",
  "PAUSE",
  "RETIRE",
]);
export type InvestmentActionRule = z.infer<typeof InvestmentActionRuleSchema>;

export const FeedbackCategorySchema = z.enum([
  "BUG",
  "UX_PROBLEM",
  "MISSING_WORKFLOW",
  "FEATURE_REQUEST",
  "PERFORMANCE_ISSUE",
  "RELIABILITY_ISSUE",
  "COMPLIANCE_REQUIREMENT",
  "TRAINING_GAP",
  "DOCUMENTATION_GAP",
  "PRICING_ISSUE",
]);
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

export const CohortRetentionRecordSchema = z.object({
  verticalId: z.string(),
  cohortPeriod: z.string(), // e.g. "2026-Q1"
  initialCount: z.number().int().nonnegative(),
  week1Pct: z.number().min(0).max(100),
  week2Pct: z.number().min(0).max(100),
  week4Pct: z.number().min(0).max(100),
  week8Pct: z.number().min(0).max(100),
  week12Pct: z.number().min(0).max(100),
  month6Pct: z.number().min(0).max(100),
  month12Pct: z.number().min(0).max(100),
});
export type CohortRetentionRecord = z.infer<typeof CohortRetentionRecordSchema>;

export const WorkflowAdoptionMetricsSchema = z.object({
  verticalId: z.string(),
  workflowName: z.string(),
  eligibleTenantsCount: z.number().int().nonnegative(),
  startedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  repeatedCount: z.number().int().nonnegative(),
  completionRatePct: z.number().min(0).max(100),
  repeatUsageRatePct: z.number().min(0).max(100),
});
export type WorkflowAdoptionMetrics = z.infer<typeof WorkflowAdoptionMetricsSchema>;

export const PmfHealthScoreInputSchema = z.object({
  verticalId: z.string(),
  cohortRetentionPct: z.number().min(0).max(100),       // 20% weight
  recurringRevenueUsd: z.number().nonnegative(),          // 20% weight
  activationRatePct: z.number().min(0).max(100),         // 15% weight
  weeklyActiveUsersCount: z.number().int().nonnegative(), // 15% weight
  workflowAdoptionRatePct: z.number().min(0).max(100),    // 15% weight
  operationalReliabilityPct: z.number().min(0).max(100),  // 15% weight
  supportTicketsPerCustomer: z.number().nonnegative(),   // up to -15% penalty
  monthlyChurnRatePct: z.number().min(0).max(100),        // up to -15% penalty
});
export type PmfHealthScoreInput = z.infer<typeof PmfHealthScoreInputSchema>;

export const PmfHealthScoreOutputSchema = z.object({
  verticalId: z.string(),
  normalizedHealthScore: z.number().min(0).max(100),
  pmfState: PmfVerticalStateSchema,
  investmentAction: InvestmentActionRuleSchema,
  scoreBreakdown: z.object({
    retentionComponent: z.number(),
    revenueComponent: z.number(),
    activationComponent: z.number(),
    wauComponent: z.number(),
    adoptionComponent: z.number(),
    reliabilityComponent: z.number(),
    supportPenalty: z.number(),
    churnPenalty: z.number(),
  }),
  evaluatedAt: z.string(),
});
export type PmfHealthScoreOutput = z.infer<typeof PmfHealthScoreOutputSchema>;

export const CustomerFeedbackRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  verticalId: z.string(),
  category: FeedbackCategorySchema,
  rawContent: z.string(),
  sourceChannel: z.enum(["IN_APP", "SUPPORT_TICKET", "INTERVIEW", "TELEMETRY"]),
  status: z.enum(["OPEN", "INVESTIGATING", "ROADMAP_LINKED", "RESOLVED"]),
  linkedFeatureKey: z.string().optional(),
  createdAt: z.string(),
});
export type CustomerFeedbackRecord = z.infer<typeof CustomerFeedbackRecordSchema>;

export const VerticalPmfSummaryProfileSchema = z.object({
  verticalId: z.string(),
  displayName: z.string(),
  northStarMetricName: z.string(),
  northStarValue: z.string(),
  activationRatePct: z.number(),
  ttfvDaysAverage: z.number(),
  wauTenantsCount: z.number(),
  cohortRetentionW4Pct: z.number(),
  featureAdoptionRatePct: z.number(),
  supportCostPerCustomerUsd: z.number(),
  monthlyChurnPct: z.number(),
  operationalReliabilityPct: z.number(),
  pmfHealthScore: z.number(),
  pmfState: PmfVerticalStateSchema,
  investmentAction: InvestmentActionRuleSchema,
});
export type VerticalPmfSummaryProfile = z.infer<typeof VerticalPmfSummaryProfileSchema>;
