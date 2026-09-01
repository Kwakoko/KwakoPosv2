import { z } from "zod";

export const HardwareModuleManifestSchema = z.object({
  moduleId: z.literal("hardware_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedCategories: z.array(
    z.enum(["CONSTRUCTION_MATERIALS", "PLUMBING", "ELECTRICAL", "TOOLS", "PAINT_FINISHING", "SAFETY_EQUIPMENT"])
  ),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type HardwareModuleManifest = z.infer<typeof HardwareModuleManifestSchema>;

export const HardwareSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  enforceMinimumMarginPct: z.number().default(10.0),
  allowContractorCreditOverRide: z.boolean().default(false),
  autoAlertOnStockoutDays: z.number().default(7),
});
export type HardwareSettings = z.infer<typeof HardwareSettingsSchema>;

export const UnitConversionRuleSchema = z.object({
  fromUnit: z.string(),
  toUnit: z.string(),
  multiplier: z.number(), // e.g. 1 Box = 10 Pieces -> multiplier = 10
});
export type UnitConversionRule = z.infer<typeof UnitConversionRuleSchema>;

export const HardwareProductSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  primaryUnit: z.string(),
  costPriceTzs: z.number(),
  retailPriceTzs: z.number(),
  contractorPriceTzs: z.number(),
  currentStock: z.number(),
  conversions: z.array(UnitConversionRuleSchema).optional(),
});
export type HardwareProduct = z.infer<typeof HardwareProductSchema>;

export const HardwareProjectRequirementSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  projectName: z.string(),
  contractorCustomerName: z.string(),
  quotedCostTzs: z.number(),
  actualSpendTzs: z.number().default(0),
  status: z.enum(["QUOTED", "APPROVED_RESERVED", "DISPATCHING", "COMPLETED"]),
});
export type HardwareProjectRequirement = z.infer<typeof HardwareProjectRequirementSchema>;

export const HardwareAiRecommendationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "INTELLIGENT_REORDERING",
    "MARGIN_PROTECTION_ALERT",
    "DEAD_STOCK_WARNING",
    "CONTRACTOR_CREDIT_RISK",
    "PROJECT_COST_OVERRUN",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type HardwareAiRecommendation = z.infer<typeof HardwareAiRecommendationSchema>;

export const HardwareEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  evaluations: z.array(
    z.object({
      pillarId: z.number(),
      pillarName: z.string(),
      passed: z.boolean(),
      details: z.string(),
    })
  ),
  digest: z.string(),
});
export type HardwareEvidencePackage = z.infer<typeof HardwareEvidencePackageSchema>;
