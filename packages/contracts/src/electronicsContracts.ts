import { z } from "zod";

export const ElectronicsModuleManifestSchema = z.object({
  moduleId: z.literal("electronics_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedCategories: z.array(
    z.enum(["SMARTPHONES", "LAPTOPS", "TVS_AUDIO", "ROUTERS_NETWORKING", "ACCESSORIES", "SPARE_PARTS"])
  ),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type ElectronicsModuleManifest = z.infer<typeof ElectronicsModuleManifestSchema>;

export const ElectronicsSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  enforceUniqueImeiRegistration: z.boolean().default(true),
  defaultWarrantyMonths: z.number().default(12),
  autoAlertOnAgingDeviceDays: z.number().default(90),
});
export type ElectronicsSettings = z.infer<typeof ElectronicsSettingsSchema>;

export const SerializedDeviceStateSchema = z.enum([
  "ORDERED",
  "RECEIVED",
  "INSPECTION",
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "CUSTOMER_OWNED",
  "WARRANTY_CLAIM",
  "REPAIR_INTAKE",
  "RETURNED",
  "QUARANTINE",
  "REFURBISHMENT",
  "RESERVED_PARTS",
  "RETIRED",
]);
export type SerializedDeviceState = z.infer<typeof SerializedDeviceStateSchema>;

export const SerializedDeviceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  serialNumber: z.string(),
  imei1: z.string().optional(),
  imei2: z.string().optional(),
  currentWarehouseId: z.string().uuid(),
  state: SerializedDeviceStateSchema,
  ownerCustomerId: z.string().uuid().optional(),
  purchaseCostTzs: z.number(),
  retailPriceTzs: z.number(),
  warrantyExpiryDate: z.string().or(z.date()).optional(),
});
export type SerializedDevice = z.infer<typeof SerializedDeviceSchema>;

export const ElectronicsRepairJobSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  repairTicketNumber: z.string(),
  serializedDeviceId: z.string().uuid(),
  customerId: z.string().uuid(),
  reportedIssue: z.string(),
  diagnosedIssue: z.string().optional(),
  assignedTechnicianUserId: z.string().uuid(),
  partsUsedCostTzs: z.number().default(0),
  laborChargeTzs: z.number().default(0),
  totalRepairCostTzs: z.number().default(0),
  status: z.enum(["INTAKE", "DIAGNOSIS", "AWAITING_PARTS", "REPAIRING", "TESTING_QA", "READY_FOR_PICKUP", "CLOSED"]),
  intakeDate: z.string().or(z.date()),
  completedDate: z.string().or(z.date()).optional(),
});
export type ElectronicsRepairJob = z.infer<typeof ElectronicsRepairJobSchema>;

export const ElectronicsAiRecommendationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "WARRANTY_DEFECT_PATTERN",
    "REPAIR_DIAGNOSTIC_ASSIST",
    "INTER_BRANCH_TRANSFER_RECOMMENDATION",
    "AGING_DEVICE_CLEARANCE",
    "SERIAL_ANOMALY_WARNING",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type ElectronicsAiRecommendation = z.infer<typeof ElectronicsAiRecommendationSchema>;

export const ElectronicsEvidencePackageSchema = z.object({
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
export type ElectronicsEvidencePackage = z.infer<typeof ElectronicsEvidencePackageSchema>;
