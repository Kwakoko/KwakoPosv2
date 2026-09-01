import { z } from "zod";

export const VerticalPmfStateEnum = z.enum([
  "PROVEN",
  "PROMISING",
  "VALIDATION_REQUIRED",
  "PRODUCT_GAP",
  "COMMERCIAL_RISK",
  "PAUSE",
]);
export type VerticalPmfState = z.infer<typeof VerticalPmfStateEnum>;

export const InvestmentDecisionEnum = z.enum([
  "DOUBLE_DOWN",
  "OPTIMIZE",
  "PILOT_MORE",
  "MAINTAIN",
  "PAUSE",
  "RETIRE",
]);
export type InvestmentDecision = z.infer<typeof InvestmentDecisionEnum>;

export const PmfHypothesisSchema = z.object({
  problemHypothesis: z.string(),
  workflowHypothesis: z.string(),
  productHypothesis: z.string(),
  valueHypothesis: z.string(),
  commercialHypothesis: z.string(),
});
export type PmfHypothesis = z.infer<typeof PmfHypothesisSchema>;

export const DesignPartnerPilotSchema = z.object({
  pilotId: z.string(),
  customerName: z.string(),
  branchCount: z.number(),
  userCount: z.number(),
  objectives: z.array(z.string()),
  successCriteria: z.string(),
  status: z.enum(["ACTIVE", "COMPLETED", "ONBOARDING", "PAUSED"]),
});
export type DesignPartnerPilot = z.infer<typeof DesignPartnerPilotSchema>;

export const ActivationMetricSchema = z.object({
  signupCount: z.number(),
  setupCount: z.number(),
  activatedCount: z.number(),
  activationRatePct: z.number(),
  dedicatedActivationEvent: z.string(),
});
export type ActivationMetric = z.infer<typeof ActivationMetricSchema>;

export const FirstTransactionSchema = z.object({
  ttfvMinutes: z.number(),
  transactionSuccessRatePct: z.number(),
  reconciledInvoicesPct: z.number(),
  stockUpdatedPct: z.number(),
});
export type FirstTransaction = z.infer<typeof FirstTransactionSchema>;

export const WorkflowAdoptionSchema = z.object({
  availableWorkflows: z.array(z.string()),
  startedCount: z.number(),
  completedCount: z.number(),
  repeatedCompletionPct: z.number(),
});
export type WorkflowAdoption = z.infer<typeof WorkflowAdoptionSchema>;

export const RetentionCohortSchema = z.object({
  day7Pct: z.number(),
  day30Pct: z.number(),
  day90Pct: z.number(),
  month6Pct: z.number(),
  month12Pct: z.number(),
});
export type RetentionCohort = z.infer<typeof RetentionCohortSchema>;

export const SupportBurdenSchema = z.object({
  ticketsPerCustomerPerMonth: z.number(),
  supportCostTzs: z.number(),
  uxFrictionScore: z.number(),
});
export type SupportBurden = z.infer<typeof SupportBurdenSchema>;

export const ChurnCauseSchema = z.object({
  category: z.enum(["PRODUCT", "PRICE", "SUPPORT", "RELIABILITY", "UX", "MISSING_WORKFLOW", "COMPETITION", "BUSINESS_CHANGE"]),
  percentage: z.number(),
  topReason: z.string(),
});
export type ChurnCause = z.infer<typeof ChurnCauseSchema>;

export const VerticalPmfScorecardSchema = z.object({
  industryId: z.string(),
  name: z.string(),
  tier: z.enum(["TIER_1_FLAGSHIP", "TIER_2_STRATEGIC", "TIER_3_SPECIALIZED"]),
  northStarMetric: z.string(),
  northStarValue: z.string(),
  pmfScore: z.number(),
  state: VerticalPmfStateEnum,
  decision: InvestmentDecisionEnum,
  activation: ActivationMetricSchema,
  firstTransaction: FirstTransactionSchema,
  wau: z.number(),
  activeBranches: z.number(),
  retention: RetentionCohortSchema,
  workflowAdoption: WorkflowAdoptionSchema,
  featureAdoptionPct: z.number(),
  supportBurden: SupportBurdenSchema,
  reliabilityPct: z.number(),
  mrrTzs: z.number(),
  churnRatePct: z.number(),
  hypotheses: PmfHypothesisSchema,
  pilots: z.array(DesignPartnerPilotSchema),
  churnCauses: z.array(ChurnCauseSchema),
});
export type VerticalPmfScorecard = z.infer<typeof VerticalPmfScorecardSchema>;

export const PmfIntelligenceRecommendationSchema = z.object({
  industryId: z.string(),
  insightType: z.enum(["ADOPTION_PATTERN", "CHURN_PREDICTOR", "WORKFLOW_FRICTION", "EXPANSION_OPPORTUNITY", "SUPPORT_THEME"]),
  description: z.string(),
  recommendedAction: z.string(),
});
export type PmfIntelligenceRecommendation = z.infer<typeof PmfIntelligenceRecommendationSchema>;

export const KwakoPosPmfFrameworkSchema = z.object({
  totalEvaluatedVerticals: z.number(),
  provenCount: z.number(),
  promisingCount: z.number(),
  validationRequiredCount: z.number(),
  productGapCount: z.number(),
  commercialRiskCount: z.number(),
  pausedCount: z.number(),
  scorecards: z.array(VerticalPmfScorecardSchema),
  intelligenceRecommendations: z.array(PmfIntelligenceRecommendationSchema),
});
export type KwakoPosPmfFramework = z.infer<typeof KwakoPosPmfFrameworkSchema>;

export const PmfEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallPmfScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  framework: KwakoPosPmfFrameworkSchema,
  digest: z.string(),
});
export type PmfEvidencePackage = z.infer<typeof PmfEvidencePackageSchema>;
