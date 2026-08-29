import { z } from "zod";

// 1. Autonomous Maturity Levels (4 Levels)
export const AutonomousMaturityLevelEnum = z.enum([
  "LEVEL_1_HUMAN_OPERATED",
  "LEVEL_2_AI_ASSISTED",
  "LEVEL_3_GUARDED_AUTOMATION",
  "LEVEL_4_AUTONOMOUS_OPERATIONS",
]);

export type AutonomousMaturityLevel = z.infer<typeof AutonomousMaturityLevelEnum>;

// 2. Autonomous Action Request & Target Blast Radius
export const AutonomousActionRequestSchema = z.object({
  requestId: z.string(),
  tenantId: z.string(),
  branchId: z.string(),
  targetService: z.string(),
  failureClass: z.string(),
  proposedRemediation: z.string(),
  maturityLevel: AutonomousMaturityLevelEnum,
  blastRadiusScope: z.enum(["SINGLE_INSTANCE", "SINGLE_SERVICE", "SINGLE_TENANT", "SINGLE_BRANCH", "REGIONAL", "GLOBAL"]),
  rollbackAvailable: z.boolean(),
  dryRunMode: z.boolean().default(false),
  createdAt: z.string(),
});

export type AutonomousActionRequest = z.infer<typeof AutonomousActionRequestSchema>;

// 3. Deterministic Policy & Circuit Breaker Evaluation
export const AutonomousPolicyEvaluationSchema = z.object({
  requestId: z.string(),
  policyPassed: z.boolean(),
  circuitBreakerTripped: z.boolean().default(false),
  riskBudgetExceeded: z.boolean().default(false),
  approvedForExecution: z.boolean(),
  evaluatedRules: z.array(z.string()),
  rejectionReason: z.string().optional(),
  evaluatedAt: z.string(),
});

export type AutonomousPolicyEvaluation = z.infer<typeof AutonomousPolicyEvaluationSchema>;

// 4. Independent Verification Result
export const AutonomousVerificationResultSchema = z.object({
  verificationId: z.string(),
  requestId: z.string(),
  isVerifiedHealthy: z.boolean(),
  serviceHealthScore: z.number().min(0).max(100),
  errorRateNormal: z.boolean(),
  latencyWithinSlo: z.boolean(),
  tenantIsolationIntact: z.boolean(),
  databaseHealthy: z.boolean(),
  syncHealthy: z.boolean(),
  verificationDetails: z.string(),
  timestamp: z.string(),
});

export type AutonomousVerificationResult = z.infer<typeof AutonomousVerificationResultSchema>;

// 5. Immutable Autonomous Action Ledger Entry
export const AutonomousActionLedgerEntrySchema = z.object({
  auditId: z.string(),
  requestId: z.string(),
  tenantId: z.string(),
  targetService: z.string(),
  failureClass: z.string(),
  remediationExecuted: z.string(),
  blastRadius: z.string(),
  verificationPassed: z.boolean(),
  escalatedToHuman: z.boolean(),
  evidenceHash: z.string(),
  timestamp: z.string(),
});

export type AutonomousActionLedgerEntry = z.infer<typeof AutonomousActionLedgerEntrySchema>;

// 6. Multilevel Autonomous Emergency Kill Switch Config
export const AutonomousKillSwitchConfigSchema = z.object({
  scope: z.enum(["GLOBAL", "REGION", "COUNTRY", "TENANT", "SERVICE", "AGENT", "ACTION"]),
  isActive: z.boolean(),
  disabledTargetIds: z.array(z.string()),
  triggeredBy: z.string(),
  triggeredAt: z.string(),
});

export type AutonomousKillSwitchConfig = z.infer<typeof AutonomousKillSwitchConfigSchema>;

// 7. Automation Risk Budget
export const AutomationRiskBudgetSchema = z.object({
  tenantId: z.string(),
  maxHourlyActions: z.number().int().positive(),
  hourlyActionsConsumed: z.number().int().nonnegative(),
  maxHourlySpendUsd: z.number().positive(),
  hourlySpendConsumed: z.number().nonnegative(),
  maxAffectedTenants: z.number().int().positive(),
  isBudgetExhausted: z.boolean().default(false),
  updatedAt: z.string(),
});

export type AutomationRiskBudget = z.infer<typeof AutomationRiskBudgetSchema>;

// 8. Autonomous Operations Dashboard Summary
export const AutonomousCommandCenterSummarySchema = z.object({
  activeAutonomousRemediations: z.number().int().nonnegative(),
  totalActionsExecuted24h: z.number().int().nonnegative(),
  verificationSuccessRatePct: z.number().min(0).max(100),
  circuitBreakersTrippedCount: z.number().int().nonnegative(),
  escalationsToHumanCount: z.number().int().nonnegative(),
  globalKillSwitchActive: z.boolean(),
});

export type AutonomousCommandCenterSummary = z.infer<typeof AutonomousCommandCenterSummarySchema>;
