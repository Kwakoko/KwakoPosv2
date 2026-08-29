import { z } from "zod";

// 1. AI Impact Risk Levels (5 Levels: Level 0 to 4)
export const AiRiskLevelEnum = z.enum([
  "LEVEL_0_INFORMATIONAL",
  "LEVEL_1_LOW_IMPACT",
  "LEVEL_2_CONTROLLED_OPERATIONAL",
  "LEVEL_3_HIGH_IMPACT",
  "LEVEL_4_RESTRICTED",
]);

export type AiRiskLevel = z.infer<typeof AiRiskLevelEnum>;

// 2. AI Autonomy Levels (5 Levels)
export const AiAutonomyLevelEnum = z.enum([
  "ASSIST",
  "APPROVE",
  "GUARDED_AUTOMATION",
  "AUTONOMOUS",
  "PROHIBITED",
]);

export type AiAutonomyLevel = z.infer<typeof AiAutonomyLevelEnum>;

// 3. AI Recommendation Record
export const AiRecommendationRecordSchema = z.object({
  recommendationId: z.string(),
  tenantId: z.string(),
  branchId: z.string(),
  domain: z.enum([
    "SALES",
    "INVENTORY",
    "FINANCE",
    "WORKFORCE",
    "OPERATIONS",
    "CUSTOMER_SERVICE",
    "ENGINEERING",
    "SAAS_REVENUE",
    "MARKETPLACE",
  ]),
  proposedAction: z.string(),
  riskLevel: AiRiskLevelEnum,
  autonomyLevel: AiAutonomyLevelEnum,
  confidenceScore: z.number().min(0).max(1.0),
  evidenceSummary: z.string(),
  policyRequirements: z.array(z.string()),
  approvalStatus: z.enum(["PENDING_POLICY", "PENDING_HUMAN_APPROVAL", "APPROVED", "REJECTED", "EXECUTED", "FAILED"]),
  createdAt: z.string(),
});

export type AiRecommendationRecord = z.infer<typeof AiRecommendationRecordSchema>;

// 4. Deterministic AI Policy Validation Result
export const AiPolicyValidationResultSchema = z.object({
  recommendationId: z.string(),
  policyPassed: z.boolean(),
  requiresHumanApproval: z.boolean(),
  automatedApprovalPermitted: z.boolean(),
  evaluatedRules: z.array(z.string()),
  violationReason: z.string().optional(),
  evaluatedAt: z.string(),
});

export type AiPolicyValidationResult = z.infer<typeof AiPolicyValidationResultSchema>;

// 5. AI Approval Record
export const AiApprovalRecordSchema = z.object({
  approvalId: z.string(),
  recommendationId: z.string(),
  approvalMode: z.enum(["HUMAN_MANUAL", "AUTOMATED_POLICY_ENGINE"]),
  approverUserId: z.string(),
  approved: z.boolean(),
  comments: z.string().optional(),
  timestamp: z.string(),
});

export type AiApprovalRecord = z.infer<typeof AiApprovalRecordSchema>;

// 6. Immutable AI Action Ledger Entry
export const AiActionLedgerEntrySchema = z.object({
  auditId: z.string(),
  recommendationId: z.string(),
  tenantId: z.string(),
  domain: z.string(),
  actionExecuted: z.string(),
  executedByIdentity: z.string(),
  executionVerified: z.boolean(),
  verificationDetails: z.string(),
  timestamp: z.string(),
});

export type AiActionLedgerEntry = z.infer<typeof AiActionLedgerEntrySchema>;

// 7. Emergency AI Kill Switch Status
export const AiKillSwitchStatusSchema = z.object({
  scope: z.enum(["GLOBAL", "TENANT", "AGENT", "TOOL", "FEATURE"]),
  isActive: z.boolean(),
  disabledTargets: z.array(z.string()),
  triggeredBy: z.string(),
  triggeredAt: z.string(),
});

export type AiKillSwitchStatus = z.infer<typeof AiKillSwitchStatusSchema>;

// 8. AI Cost Governance Quota
export const AiCostGovernanceQuotaSchema = z.object({
  tenantId: z.string(),
  monthlyTokenBudget: z.number().int().positive(),
  tokensConsumedThisMonth: z.number().int().nonnegative(),
  monthlyUsdBudget: z.number().positive(),
  usdConsumedThisMonth: z.number().nonnegative(),
  isThrottled: z.boolean().default(false),
  updatedAt: z.string(),
});

export type AiCostGovernanceQuota = z.infer<typeof AiCostGovernanceQuotaSchema>;

// 9. AI Command Center Dashboard Summary
export const AiCommandCenterSummarySchema = z.object({
  activeAiAgentsCount: z.number().int().nonnegative(),
  totalRecommendationsGenerated: z.number().int().nonnegative(),
  pendingHumanApprovals: z.number().int().nonnegative(),
  guardedAutomatedExecutionsCount: z.number().int().nonnegative(),
  killSwitchActive: z.boolean(),
  monthlyCostEfficiencyPct: z.number().min(0).max(100),
});

export type AiCommandCenterSummary = z.infer<typeof AiCommandCenterSummarySchema>;
