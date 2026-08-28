import { z } from "zod";

export const LatencyPercentilesSchema = z.object({
  p50Ms: z.number(),
  p90Ms: z.number(),
  p95Ms: z.number(),
  p99Ms: z.number(),
});
export type LatencyPercentiles = z.infer<typeof LatencyPercentilesSchema>;

export const WorkloadMultiplierEnum = z.enum(["BASELINE_1X", "MULTIPLIER_10X", "MULTIPLIER_50X", "STRESS_100X"]);
export type WorkloadMultiplier = z.infer<typeof WorkloadMultiplierEnum>;

export const BottleneckClassificationEnum = z.enum([
  "OPTIMIZATION_PROBLEM",
  "CAPACITY_PROBLEM",
  "ARCHITECTURE_PROBLEM",
  "EXTERNAL_DEPENDENCY_PROBLEM",
]);
export type BottleneckClassification = z.infer<typeof BottleneckClassificationEnum>;

export const SubsystemPerformanceMetricSchema = z.object({
  subsystem: z.string(),
  workloadMultiplier: WorkloadMultiplierEnum,
  latency: LatencyPercentilesSchema,
  throughputRps: z.number(),
  throughputTps: z.number(),
  errorRatePct: z.number(),
  saturationPct: z.number(),
  status: z.enum(["PASS", "WARNING", "SATURATED", "FAIL"]),
  notes: z.string(),
});
export type SubsystemPerformanceMetric = z.infer<typeof SubsystemPerformanceMetricSchema>;

export const TenantCapacityProfileSchema = z.object({
  maxProducts: z.number(),
  maxVariants: z.number(),
  maxCustomers: z.number(),
  maxEmployees: z.number(),
  maxBranches: z.number(),
  maxPosUsers: z.number(),
  dailyTransactions: z.number(),
  dailyStockMovements: z.number(),
  dailySyncEvents: z.number(),
  dailyReports: z.number(),
  dailyAiRequests: z.number(),
});
export type TenantCapacityProfile = z.infer<typeof TenantCapacityProfileSchema>;

export const BottleneckItemSchema = z.object({
  component: z.string(),
  classification: BottleneckClassificationEnum,
  saturationPoint: z.string(),
  recommendation: z.string(),
});

export const KwakoPosCapacityModelSchema = z.object({
  appVersion: z.string(),
  gitSha: z.string(),
  profile: TenantCapacityProfileSchema,
  comfortableLimit: z.string(),
  supportedLimit: z.string(),
  stressLimit: z.string(),
  architecturalLimit: z.string(),
  projections12m: z.object({ tenants: z.number(), estCostPerTenantTzs: z.number(), infraUnitsRequired: z.number() }),
  projections36m: z.object({ tenants: z.number(), estCostPerTenantTzs: z.number(), infraUnitsRequired: z.number() }),
  projections60m: z.object({ tenants: z.number(), estCostPerTenantTzs: z.number(), infraUnitsRequired: z.number() }),
  rankedBottlenecks: z.array(BottleneckItemSchema),
});
export type KwakoPosCapacityModel = z.infer<typeof KwakoPosCapacityModelSchema>;

export const PerformanceEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  baselineMetrics: z.array(SubsystemPerformanceMetricSchema),
  workload10x: z.array(SubsystemPerformanceMetricSchema),
  workload50x: z.array(SubsystemPerformanceMetricSchema),
  workload100x: z.array(SubsystemPerformanceMetricSchema),
  capacityModel: KwakoPosCapacityModelSchema,
  digest: z.string(),
});
export type PerformanceEvidencePackage = z.infer<typeof PerformanceEvidencePackageSchema>;
