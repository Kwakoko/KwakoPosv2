import { z } from "zod";

export const LawFirmModuleManifestSchema = z.object({
  moduleId: z.literal("law_firm_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedPracticeAreas: z.array(
    z.enum([
      "LITIGATION",
      "CORPORATE",
      "COMMERCIAL",
      "CONVEYANCING_PROPERTY",
      "EMPLOYMENT",
      "FAMILY",
      "IMMIGRATION",
      "TAX",
      "INTELLECTUAL_PROPERTY",
      "BANKING_FINANCE",
      "ARBITRATION",
    ])
  ),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type LawFirmModuleManifest = z.infer<typeof LawFirmModuleManifestSchema>;

export const LawFirmSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  requireConflictCheckBeforeMatterOpen: z.boolean().default(true),
  defaultHourlyRateTzs: z.number().default(250000),
  segregateClientTrustFunds: z.boolean().default(true),
  autoEscalateMissedDeadlines: z.boolean().default(true),
});
export type LawFirmSettings = z.infer<typeof LawFirmSettingsSchema>;

export const MatterStatusEnum = z.enum([
  "INTAKE",
  "CONFLICT_CHECK",
  "OPEN",
  "ACTIVE",
  "LITIGATION",
  "NEGOTIATION",
  "RESOLUTION",
  "CLOSED",
  "ARCHIVED",
]);
export type MatterStatus = z.infer<typeof MatterStatusEnum>;

export const LegalMatterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  matterNumber: z.string(),
  title: z.string(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  practiceArea: z.string(),
  responsiblePartnerId: z.string().uuid(),
  opposingParty: z.string().optional(),
  jurisdictionCourt: z.string().optional(),
  billingArrangement: z.enum(["HOURLY", "FIXED_FEE", "RETAINER", "MILESTONE", "CONTINGENCY"]),
  status: MatterStatusEnum,
  openDate: z.string().or(z.date()),
  targetCloseDate: z.string().or(z.date()).optional(),
  confidentialityLevel: z.enum(["STANDARD", "CONFIDENTIAL", "HIGHLY_RESTRICTED"]).default("STANDARD"),
});
export type LegalMatter = z.infer<typeof LegalMatterSchema>;

export const ConflictCheckResultSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  searchedName: z.string(),
  hasConflict: z.boolean(),
  matchingEntities: z.array(z.string()),
  reviewedByUserId: z.string().uuid(),
  decision: z.enum(["APPROVED_NO_CONFLICT", "DECLINED_CONFLICT_EXISTS", "APPROVED_WITH_WAIVER"]),
  timestamp: z.string().or(z.date()),
});
export type ConflictCheckResult = z.infer<typeof ConflictCheckResultSchema>;

export const LegalDeadlineSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  matterId: z.string().uuid(),
  title: z.string(),
  deadlineType: z.enum(["COURT_FILING", "LIMITATION_DATE", "CONTRACT_RENEWAL", "CLIENT_RESPONSE", "INTERNAL_REVIEW"]),
  dueDate: z.string().or(z.date()),
  assignedAttorneyId: z.string().uuid(),
  isCritical: z.boolean().default(true),
  status: z.enum(["PENDING", "COMPLETED", "EXPIRED", "ESCALATED"]),
});
export type LegalDeadline = z.infer<typeof LegalDeadlineSchema>;

export const TimeEntrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  matterId: z.string().uuid(),
  attorneyId: z.string().uuid(),
  attorneyName: z.string(),
  activityDescription: z.string(),
  durationHours: z.number(),
  hourlyRateTzs: z.number(),
  totalBillableTzs: z.number(),
  isBillable: z.boolean().default(true),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "INVOICED", "WRITTEN_OFF"]),
  entryDate: z.string().or(z.date()),
});
export type TimeEntry = z.infer<typeof TimeEntrySchema>;

export const TrustAccountTransactionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  matterId: z.string().uuid(),
  clientId: z.string().uuid(),
  transactionType: z.enum(["RETAINER_DEPOSIT", "FEE_WITHDRAWAL", "DISBURSEMENT", "REFUND"]),
  amountTzs: z.number(),
  trustBalanceAfter: z.number(),
  authorizedByUserId: z.string().uuid(),
  timestamp: z.string().or(z.date()),
});
export type TrustAccountTransaction = z.infer<typeof TrustAccountTransactionSchema>;

export const LawFirmAiRecommendationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "DEADLINE_LIMITATION_RISK",
    "UNBILLED_TIME_LEAKAGE",
    "RETAINER_REPLENISHMENT_REQUIRED",
    "MATTER_INACTIVITY_ALERT",
    "CONFLICT_OF_INTEREST_WARNING",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type LawFirmAiRecommendation = z.infer<typeof LawFirmAiRecommendationSchema>;

export const LawFirmEvidencePackageSchema = z.object({
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
export type LawFirmEvidencePackage = z.infer<typeof LawFirmEvidencePackageSchema>;
