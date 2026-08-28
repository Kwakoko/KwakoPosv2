import { z } from "zod";

export const IncidentSeverityEnum = z.enum([
  "SEV_0_CATASTROPHIC",
  "SEV_1_MAJOR",
  "SEV_2_DEGRADED",
  "SEV_3_MINOR",
]);
export type IncidentSeverity = z.infer<typeof IncidentSeverityEnum>;

export const SliMetricSchema = z.object({
  subsystem: z.string(),
  metricName: z.string(),
  sliValue: z.number(),
  sloTarget: z.number(),
  unit: z.string(),
  status: z.enum(["HEALTHY", "WARNING", "DEGRADED", "BREACHED"]),
});
export type SliMetric = z.infer<typeof SliMetricSchema>;

export const ErrorBudgetBurnRateSchema = z.object({
  subsystem: z.string(),
  monthlyErrorBudgetPct: z.number(),
  consumedBudgetPct: z.number(),
  remainingBudgetPct: z.number(),
  burnRateMultiplier: z.number(),
  burnRateStatus: z.enum(["NORMAL", "ELEVATED", "CRITICAL_BURN", "EXHAUSTED"]),
});
export type ErrorBudgetBurnRate = z.infer<typeof ErrorBudgetBurnRateSchema>;

export const AutoRemediationActionSchema = z.object({
  actionId: z.string(),
  subsystem: z.string(),
  triggerReason: z.string(),
  remediationType: z.enum([
    "CONNECTION_RECYCLE",
    "QUEUE_REBALANCE",
    "CIRCUIT_BREAKER_TRIP",
    "WORKER_RESTART",
    "AUTO_FAILOVER",
  ]),
  status: z.enum(["EXECUTED", "RECOVERED", "FAILED"]),
  executionMs: z.number(),
});
export type AutoRemediationAction = z.infer<typeof AutoRemediationActionSchema>;

export const KwakoPosReliabilityScorecardSchema = z.object({
  overallAvailabilityPct: z.number(),
  totalSlosTracked: z.number(),
  slosMet: z.number(),
  slis: z.array(SliMetricSchema),
  errorBudgets: z.array(ErrorBudgetBurnRateSchema),
  remediations: z.array(AutoRemediationActionSchema),
});
export type KwakoPosReliabilityScorecard = z.infer<typeof KwakoPosReliabilityScorecardSchema>;

export const ReliabilityEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  scorecard: KwakoPosReliabilityScorecardSchema,
  digest: z.string(),
});
export type ReliabilityEvidencePackage = z.infer<typeof ReliabilityEvidencePackageSchema>;
