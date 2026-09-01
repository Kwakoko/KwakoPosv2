import { z } from "zod";

export const PortfolioTierEnum = z.enum(["TIER_1_FLAGSHIP", "TIER_2_STRATEGIC", "TIER_3_SPECIALIZED"]);
export type PortfolioTier = z.infer<typeof PortfolioTierEnum>;

export const CommercialActionEnum = z.enum(["INVEST", "GROW", "MAINTAIN", "PILOT", "PAUSE", "RETIRE"]);
export type CommercialAction = z.infer<typeof CommercialActionEnum>;

export const ReadinessGateSchema = z.object({
  gate: z.enum(["GATE_A_PRODUCT", "GATE_B_ENGINEERING", "GATE_C_COMMERCIAL", "GATE_D_MARKET"]),
  passed: z.boolean(),
  details: z.string(),
});
export type ReadinessGate = z.infer<typeof ReadinessGateSchema>;

export const PricingPackageSchema = z.object({
  name: z.string(),
  priceTzs: z.number(),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
  features: z.array(z.string()),
});
export type PricingPackage = z.infer<typeof PricingPackageSchema>;

export const VerticalProductProfileSchema = z.object({
  industryId: z.string(),
  name: z.string(),
  tier: PortfolioTierEnum,
  targetCustomer: z.string(),
  valueProposition: z.string(),
  primaryCommercialPromise: z.string(),
  activationEvent: z.string(),
  onboardingTasks: z.array(z.string()),
  pricingPackages: z.array(PricingPackageSchema),
  gates: z.array(ReadinessGateSchema),
  score: z.number(),
  action: CommercialActionEnum,
});
export type VerticalProductProfile = z.infer<typeof VerticalProductProfileSchema>;

export const CommercialUnitEconomicsSchema = z.object({
  cacTzs: z.number(),
  arpuTzs: z.number(),
  grossMarginPct: z.number(),
  supportCostTzs: z.number(),
  ltvTzs: z.number(),
});
export type CommercialUnitEconomics = z.infer<typeof CommercialUnitEconomicsSchema>;

export const KwakoPosCommercialPortfolioSchema = z.object({
  totalVerticals: z.number(),
  tier1Count: z.number(),
  tier2Count: z.number(),
  tier3Count: z.number(),
  flagshipVerticals: z.array(VerticalProductProfileSchema),
  strategicVerticals: z.array(VerticalProductProfileSchema),
  specializedVerticals: z.array(VerticalProductProfileSchema),
  unitEconomics: CommercialUnitEconomicsSchema,
});
export type KwakoPosCommercialPortfolio = z.infer<typeof KwakoPosCommercialPortfolioSchema>;

export const CommercialEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  portfolio: KwakoPosCommercialPortfolioSchema,
  digest: z.string(),
});
export type CommercialEvidencePackage = z.infer<typeof CommercialEvidencePackageSchema>;
