import { z } from "zod";

// ============================================================
// Phase 44 — KwakoPos Platform Intelligence Contracts (KPIOL v1.0.0)
// ============================================================

export const IntelligenceSignalTypeEnum = z.enum([
  "DEMAND_ANOMALY", "MARGIN_COMPRESSION", "SUPPLY_CHAIN_BOTTLENECK",
  "CHURN_RISK", "CASH_FLOW_PRESSURE", "SECURITY_BEHAVIOR_ANOMALY", "RELEASE_REGRESSION_RISK",
]);
export type IntelligenceSignalType = z.infer<typeof IntelligenceSignalTypeEnum>;

export const IntelligenceSignalSeverityEnum = z.enum(["INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type IntelligenceSignalSeverity = z.infer<typeof IntelligenceSignalSeverityEnum>;

export const IntelligenceSignalSchema = z.object({
  signalId: z.string(),
  tenantId: z.string(),
  signalType: IntelligenceSignalTypeEnum,
  severity: IntelligenceSignalSeverityEnum,
  confidenceScore: z.number().min(0).max(1).default(0.9),
  evidenceSummary: z.string(),
  affectedDomain: z.string(),
  timestamp: z.string(),
});
export type IntelligenceSignal = z.infer<typeof IntelligenceSignalSchema>;

export const PlatformInsightRecommendationSchema = z.object({
  recommendationId: z.string(),
  signalId: z.string(),
  tenantId: z.string(),
  recommendedAction: z.string(),
  financialImpactTzs: z.number().nonnegative().default(0),
  riskAssessment: z.string().default("LOW_RISK"),
  isAutoActionable: z.boolean().default(false),
  status: z.enum(["PROPOSED", "ACCEPTED", "REJECTED", "EXECUTED"]).default("PROPOSED"),
  createdAt: z.string(),
});
export type PlatformInsightRecommendation = z.infer<typeof PlatformInsightRecommendationSchema>;

export const PlatformIntelligenceHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  ingestedSignalsCount: z.number().int().nonnegative(),
  activeRecommendationsCount: z.number().int().nonnegative(),
  acceptedRecommendationsCount: z.number().int().nonnegative(),
  avgConfidenceScore: z.number().min(0).max(1),
  auditEntryCount: z.number().int().nonnegative(),
});
export type PlatformIntelligenceHealthSummary = z.infer<typeof PlatformIntelligenceHealthSummarySchema>;

export const PlatformIntelligenceAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "SIGNAL_INGESTED", "RECOMMENDATION_GENERATED", "RECOMMENDATION_ACCEPTED",
    "SCENARIO_EVALUATED", "MODEL_DRIFT_DETECTED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type PlatformIntelligenceAuditEntry = z.infer<typeof PlatformIntelligenceAuditEntrySchema>;
