import { z } from "zod";

export const CommercialReadinessPortfolioTierSchema = z.enum([
  "TIER1_FLAGSHIP",
  "TIER2_STRATEGIC",
  "TIER3_SPECIALIZED",
  "TIER_1_FLAGSHIP",
  "TIER_2_STRATEGIC",
  "TIER_3_SPECIALIZED",
]);
export type CommercialReadinessPortfolioTier = z.infer<typeof CommercialReadinessPortfolioTierSchema>;



export const CommercialDecisionActionSchema = z.enum([
  "INVEST",
  "GROW",
  "MAINTAIN",
  "PILOT",
  "PAUSE",
  "RETIRE",
]);
export type CommercialDecisionAction = z.infer<typeof CommercialDecisionActionSchema>;

export const ReadinessGateStatusSchema = z.enum([
  "PASSED",
  "FAILED",
  "IN_PROGRESS",
  "NOT_STARTED",
]);
export type ReadinessGateStatus = z.infer<typeof ReadinessGateStatusSchema>;

export const CommercialReadinessGatesSchema = z.object({
  gateA_ProductReadiness: ReadinessGateStatusSchema,
  gateB_EngineeringReadiness: ReadinessGateStatusSchema,
  gateC_CommercialReadiness: ReadinessGateStatusSchema,
  gateD_MarketReadiness: ReadinessGateStatusSchema,
  overallGA_Eligible: z.boolean(),
});
export type CommercialReadinessGates = z.infer<typeof CommercialReadinessGatesSchema>;

export const UnitEconomicsSchema = z.object({
  cacUsd: z.number().nonnegative(),             // Customer Acquisition Cost
  arpuUsd: z.number().nonnegative(),            // Average Revenue Per User
  grossMarginPct: z.number().min(0).max(100),   // Gross Margin %
  supportCostUsd: z.number().nonnegative(),     // Monthly Support Cost
  ltvUsd: z.number().nonnegative(),             // Lifetime Value
  ltvToCacRatio: z.number().nonnegative(),      // LTV / CAC ratio
});
export type UnitEconomics = z.infer<typeof UnitEconomicsSchema>;

export const VerticalCommercialProfileSchema = z.object({
  verticalId: z.string(),
  displayName: z.string(),
  tier: CommercialReadinessPortfolioTierSchema,
  targetCustomer: z.string(),
  valueProposition: z.string(),
  primaryPromise: z.string(),
  activationEvent: z.string(),
  keyMetrics: z.array(z.string()),
  pricingPackages: z.array(
    z.object({
      packageName: z.string(), // e.g. "Starter", "Professional", "Enterprise"
      priceMonthlyUsd: z.number().nonnegative(),
      featuresIncluded: z.array(z.string()),
    })
  ),
  readinessGates: CommercialReadinessGatesSchema,
  unitEconomics: UnitEconomicsSchema,
  demoEnvironmentReady: z.boolean(),
  designPartnersActiveCount: z.number().int().nonnegative(),
  actionRecommendation: CommercialDecisionActionSchema,
});
export type VerticalCommercialProfile = z.infer<typeof VerticalCommercialProfileSchema>;

export const PortfolioPriorityScoreInputSchema = z.object({
  verticalId: z.string(),
  marketDemandScore: z.number().min(0).max(10),       // 0-10
  customerEvidenceScore: z.number().min(0).max(10),   // 0-10
  productReadinessScore: z.number().min(0).max(10),   // 0-10
  reliabilityScore: z.number().min(0).max(10),        // 0-10
  commercialViabilityScore: z.number().min(0).max(10), // 0-10
  competitivePositionScore: z.number().min(0).max(10),// 0-10
  revenuePotentialScore: z.number().min(0).max(10),   // 0-10
  implementationCostScore: z.number().min(0).max(10), // 0-10 (subtracted)
  supportCostScore: z.number().min(0).max(10),        // 0-10 (subtracted)
  complianceRiskScore: z.number().min(0).max(10),     // 0-10 (subtracted)
});
export type PortfolioPriorityScoreInput = z.infer<typeof PortfolioPriorityScoreInputSchema>;

export const PortfolioPriorityScoreOutputSchema = z.object({
  verticalId: z.string(),
  rawScore: z.number(),
  normalizedScore: z.number().min(0).max(100),
  tierAssignment: CommercialReadinessPortfolioTierSchema,
  actionRecommendation: CommercialDecisionActionSchema,
  evaluatedAt: z.string(),
});
export type PortfolioPriorityScoreOutput = z.infer<typeof PortfolioPriorityScoreOutputSchema>;

export const IndustryOnboardingTemplateSchema = z.object({
  verticalId: z.string(),
  industryName: z.string(),
  defaultRoleNames: z.array(z.string()),
  defaultNavigationItems: z.array(z.string()),
  defaultWorkflows: z.array(z.string()),
  defaultReports: z.array(z.string()),
  terminologyMap: z.record(z.string(), z.string()),
  featureFlags: z.record(z.string(), z.boolean()),
  onboardingTasks: z.array(z.string()),
});
export type IndustryOnboardingTemplate = z.infer<typeof IndustryOnboardingTemplateSchema>;
