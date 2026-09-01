import { z } from "zod";

export const PoultryLivestockModuleManifestSchema = z.object({
  moduleId: z.literal("poultry_livestock_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedSpecies: z.array(
    z.enum(["POULTRY_LAYERS", "POULTRY_BROILERS", "CATTLE_DAIRY", "CATTLE_BEEF", "GOATS_SHEEP", "PIGS", "RABBITS"])
  ),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type PoultryLivestockModuleManifest = z.infer<typeof PoultryLivestockModuleManifestSchema>;

export const PoultryLivestockSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  requireVaccinationReminders: z.boolean().default(true),
  trackBatchLevelFeed: z.boolean().default(true),
  autoAlertOnHighMortalityPct: z.number().default(2.0),
});
export type PoultryLivestockSettings = z.infer<typeof PoultryLivestockSettingsSchema>;

export const FarmFlockBatchSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  farmName: z.string(),
  houseNumber: z.string(),
  flockCode: z.string(),
  species: z.string(),
  breed: z.string(),
  placementDate: z.string().or(z.date()),
  openingQuantity: z.number(),
  currentQuantity: z.number(),
  totalMortality: z.number().default(0),
  totalCulls: z.number().default(0),
  status: z.enum(["BROODING", "GROWING", "LAYING_PRODUCTION", "PROCESSING", "DISPOSED", "CLEARED"]),
});
export type FarmFlockBatch = z.infer<typeof FarmFlockBatchSchema>;

export const EggProductionRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  flockId: z.string().uuid(),
  collectionDate: z.string().or(z.date()),
  totalGoodEggs: z.number(),
  totalBrokenEggs: z.number(),
  totalDirtyEggs: z.number(),
  layRatePct: z.number(),
  recordedByUserId: z.string().uuid(),
});
export type EggProductionRecord = z.infer<typeof EggProductionRecordSchema>;

export const FeedConsumptionRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  flockId: z.string().uuid(),
  feedType: z.string(),
  quantityKg: z.number(),
  totalCostTzs: z.number(),
  fcrRatio: z.number().optional(),
  timestamp: z.string().or(z.date()),
});
export type FeedConsumptionRecord = z.infer<typeof FeedConsumptionRecordSchema>;

export const PoultryLivestockAiRecommendationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "HEALTH_EARLY_WARNING",
    "FEED_OPTIMIZATION",
    "MORTALITY_ALERT",
    "PRODUCTION_FORECAST",
    "BIOSECURITY_EXCEPTION",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type PoultryLivestockAiRecommendation = z.infer<typeof PoultryLivestockAiRecommendationSchema>;

export const PoultryLivestockEvidencePackageSchema = z.object({
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
export type PoultryLivestockEvidencePackage = z.infer<typeof PoultryLivestockEvidencePackageSchema>;
