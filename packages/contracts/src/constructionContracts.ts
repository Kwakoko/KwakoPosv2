import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "TENDER",
  "ESTIMATION",
  "CONTRACT_SIGNED",
  "SITE_MOBILIZATION",
  "IN_PROGRESS",
  "INSPECTION_QC",
  "PRACTICAL_COMPLETION",
  "FINAL_HANDOVER",
  "CLOSED",
  "CANCELLED",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const BoqItemRecordSchema = z.object({
  id: z.string().uuid(),
  itemCode: z.string(), // e.g. "CIVIL-CONC-001"
  description: z.string(),
  unitOfMeasure: z.string(), // e.g. "m3", "tonnes", "m2"
  plannedQuantity: z.number().positive(),
  unitRateUsd: z.number().nonnegative(),
  plannedAmountUsd: z.number().nonnegative(),
  actualQuantity: z.number().nonnegative().default(0),
  actualAmountUsd: z.number().nonnegative().default(0),
  costCategory: z.enum(["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACTOR", "OVERHEAD"]),
  workPackage: z.string(),
});
export type BoqItemRecord = z.infer<typeof BoqItemRecordSchema>;

export const ConstructionProjectMasterSchema = z.object({
  id: z.string().uuid(),
  projectNumber: z.string(),
  projectName: z.string(),
  clientId: z.string().uuid(),
  projectManagerId: z.string().uuid(),
  contractValueUsd: z.number().nonnegative(),
  originalBudgetUsd: z.number().nonnegative(),
  revisedBudgetUsd: z.number().nonnegative(),
  actualCostUsd: z.number().nonnegative().default(0),
  committedCostUsd: z.number().nonnegative().default(0),
  startDate: z.string(),
  targetCompletionDate: z.string(),
  status: ProjectStatusSchema,
  retentionPct: z.number().min(0).max(30).default(5),
  retentionBalanceUsd: z.number().nonnegative().default(0),
});
export type ConstructionProjectMaster = z.infer<typeof ConstructionProjectMasterSchema>;

export const SiteStoreMaterialMovementSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  siteId: z.string().uuid(),
  boqItemId: z.string().uuid().optional(),
  materialSku: z.string(),
  quantity: z.number().positive(),
  movementType: z.enum(["PURCHASE_RECEIPT", "WAREHOUSE_TRANSFER", "SITE_ISSUE", "SITE_RETURN", "WASTAGE", "SCRAP"]),
  unitCostUsd: z.number().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  stockLedgerEventId: z.string(),
  recordedAt: z.string(),
});
export type SiteStoreMaterialMovement = z.infer<typeof SiteStoreMaterialMovementSchema>;

export const ProjectVariationRequestSchema = z.object({
  id: z.string().uuid(),
  variationNumber: z.string(),
  projectId: z.string().uuid(),
  description: z.string(),
  costImpactUsd: z.number(),
  scheduleImpactDays: z.number().int(),
  approvalStatus: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]),
  approvedByClientId: z.string().optional(),
  approvedAt: z.string().optional(),
});
export type ProjectVariationRequest = z.infer<typeof ProjectVariationRequestSchema>;

export const InterimPaymentCertificateSchema = z.object({
  id: z.string().uuid(),
  certificateNumber: z.string(),
  projectId: z.string().uuid(),
  measuredWorkValueUsd: z.number().nonnegative(),
  approvedVariationsValueUsd: z.number().nonnegative().default(0),
  grossCertifiedValueUsd: z.number().nonnegative(),
  lessRetentionDeductionUsd: z.number().nonnegative(),
  lessPreviousPaymentsUsd: z.number().nonnegative().default(0),
  netBillableAmountUsd: z.number().nonnegative(),
  certifiedAt: z.string(),
  status: z.enum(["CERTIFIED", "INVOICED", "PAID"]),
});
export type InterimPaymentCertificate = z.infer<typeof InterimPaymentCertificateSchema>;

export const EarnedValueMetricsSchema = z.object({
  projectId: z.string().uuid(),
  plannedValuePvUsd: z.number().nonnegative(),
  earnedValueEvUsd: z.number().nonnegative(),
  actualCostAcUsd: z.number().nonnegative(),
  costVarianceCvUsd: z.number(), // EV - AC
  scheduleVarianceSvUsd: z.number(), // EV - PV
  cpi: z.number(), // EV / AC
  spi: z.number(), // EV / PV
  forecastFinalCostEacUsd: z.number(), // BAC / CPI
});
export type EarnedValueMetrics = z.infer<typeof EarnedValueMetricsSchema>;

export const ConstructionFinancialSummarySchema = z.object({
  totalProjectsCount: z.number().int().nonnegative(),
  totalContractValueUsd: z.number().nonnegative(),
  totalActualCostUsd: z.number().nonnegative(),
  totalCertifiedRevenueUsd: z.number().nonnegative(),
  totalRetentionHeldUsd: z.number().nonnegative(),
  grossMarginUsd: z.number(),
  marginPct: z.number(),
});
export type ConstructionFinancialSummary = z.infer<typeof ConstructionFinancialSummarySchema>;
