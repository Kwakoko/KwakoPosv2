import { z } from "zod";

export const SystemTierEnum = z.enum(["Tier0", "Tier1", "Tier2", "Tier3"]);
export type SystemTier = z.infer<typeof SystemTierEnum>;

export const DisasterScenarioEnum = z.enum([
  "CLOUD_RUN_FAILURE",
  "DATABASE_FAILURE",
  "NETWORK_FAILURE",
  "SYNC_BACKLOG",
  "CORRUPTED_MESSAGE",
  "PAYMENT_PROVIDER_OUTAGE",
  "MARKETPLACE_OUTAGE",
  "REGIONAL_OUTAGE",
  "FAILED_DEPLOYMENT",
  "BAD_MIGRATION",
]);
export type DisasterScenario = z.infer<typeof DisasterScenarioEnum>;

export const ResilienceStatusEnum = z.enum(["PASS", "CONDITIONAL", "FAIL"]);
export type ResilienceStatus = z.infer<typeof ResilienceStatusEnum>;

export const ResilienceRpoMetricsSchema = z.object({
  targetRpoSeconds: z.number(),
  actualRpoSeconds: z.number(),
  rpoCompliant: z.boolean(),
});
export type ResilienceRpoMetrics = z.infer<typeof ResilienceRpoMetricsSchema>;

export const ResilienceRtoMetricsSchema = z.object({
  targetRtoSeconds: z.number(),
  actualRtoSeconds: z.number(),
  rtoCompliant: z.boolean(),
});
export type ResilienceRtoMetrics = z.infer<typeof ResilienceRtoMetricsSchema>;

export const RecoveryReconciliationAuditSchema = z.object({
  preCheckCount: z.number(),
  postCheckCount: z.number(),
  orphansDetected: z.number(),
  duplicateTransactions: z.number(),
  financialBalanceVariance: z.number(),
  tenantLeakageDetected: z.boolean(),
  reconciliationPassed: z.boolean(),
  details: z.string(),
});
export type RecoveryReconciliationAudit = z.infer<typeof RecoveryReconciliationAuditSchema>;

export const ResilienceScenarioResultSchema = z.object({
  scenario: DisasterScenarioEnum,
  tier: SystemTierEnum,
  rpo: ResilienceRpoMetricsSchema,
  rto: ResilienceRtoMetricsSchema,
  recovered: z.boolean(),
  dataIntegrityPassed: z.boolean(),
  financialIntegrityPassed: z.boolean(),
  inventoryIntegrityPassed: z.boolean(),
  tenantIsolationPassed: z.boolean(),
  syncConvergencePassed: z.boolean(),
  quarantineSuccess: z.boolean(),
  reconciliation: RecoveryReconciliationAuditSchema,
  status: ResilienceStatusEnum,
  notes: z.string(),
});
export type ResilienceScenarioResult = z.infer<typeof ResilienceScenarioResultSchema>;

export const ResilienceEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: ResilienceStatusEnum,
  scenariosExecuted: z.number(),
  scenariosPassed: z.number(),
  results: z.array(ResilienceScenarioResultSchema),
  digest: z.string(),
});
export type ResilienceEvidencePackage = z.infer<typeof ResilienceEvidencePackageSchema>;

export const DisasterRecoveryRunbookStepSchema = z.object({
  stepNumber: z.number(),
  phase: z.enum(["TRIGGER", "DETECTION", "CONTAINMENT", "RECOVERY", "RECONCILIATION", "COMMUNICATION", "CLOSURE"]),
  action: z.string(),
  commandOrProcedure: z.string(),
  expectedOutcome: z.string(),
});

export const DisasterRecoveryRunbookSchema = z.object({
  id: z.string(),
  scenario: DisasterScenarioEnum,
  title: z.string(),
  tier: SystemTierEnum,
  targetRpoSeconds: z.number(),
  targetRtoSeconds: z.number(),
  ownerRole: z.string(),
  steps: z.array(DisasterRecoveryRunbookStepSchema),
});
export type DisasterRecoveryRunbook = z.infer<typeof DisasterRecoveryRunbookSchema>;
