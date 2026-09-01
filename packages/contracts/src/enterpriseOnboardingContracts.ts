import { z } from "zod";

// 1. Onboarding Lifecycle Stages (12 Stages)
export const OnboardingStageEnum = z.enum([
  "SALES_HANDOFF",
  "DISCOVERY",
  "SOLUTION_DESIGN",
  "CONFIGURATION",
  "DATA_MIGRATION",
  "INTEGRATION",
  "TRAINING",
  "PILOT",
  "GO_LIVE_READINESS",
  "GO_LIVE",
  "HYPERCARE",
  "SUCCESS_REVIEW",
  "ADOPTION_EXPANSION",
]);

export type OnboardingStage = z.infer<typeof OnboardingStageEnum>;

// 2. Discovery Profile
export const DiscoveryProfileSchema = z.object({
  organizationName: z.string(),
  industry: z.string(),
  businessModel: z.string(),
  branchCount: z.number().int().min(1),
  userCount: z.number().int().min(1),
  operatingLocations: z.array(z.string()),
  inventoryModel: z.string(),
  financialProcesses: z.array(z.string()),
  currentSystems: z.array(z.string()),
  integrationsRequired: z.array(z.string()),
  complianceObligations: z.array(z.string()),
  offlineRequirements: z.boolean(),
  networkConditions: z.enum(["EXCELLENT", "MODERATE", "POOR_OFFLINE_CRITICAL"]),
  businessCriticalWorkflows: z.array(z.string()),
  completedAt: z.string().optional(),
  approvedByCustomer: z.boolean().default(false),
});

export type DiscoveryProfile = z.infer<typeof DiscoveryProfileSchema>;

// 3. Solution Blueprint
export const SolutionBlueprintSchema = z.object({
  blueprintId: z.string(),
  projectName: z.string(),
  customerName: z.string(),
  industry: z.string(),
  enabledModules: z.array(z.string()),
  selectedIndustryModule: z.string(),
  branchScope: z.array(z.string()),
  userRoleMatrix: z.array(
    z.object({
      roleName: z.string(),
      assignedUserCount: z.number().int(),
      permissions: z.array(z.string()),
    })
  ),
  dataMigrationScope: z.array(z.string()),
  integrationsConfigured: z.array(z.string()),
  goLiveStrategy: z.enum(["BIG_BANG", "PHASED", "WAVE_BASED", "PARALLEL_RUN"]),
  rollbackStrategy: z.string(),
  approvedByCustomer: z.boolean().default(false),
  approvalDate: z.string().optional(),
});

export type SolutionBlueprint = z.infer<typeof SolutionBlueprintSchema>;

// 4. Data Readiness Scorecard
export const DataReadinessScorecardSchema = z.object({
  datasetName: z.string(),
  totalSourceRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  invalidIdentifierRows: z.number().int().nonnegative(),
  inconsistentUomRows: z.number().int().nonnegative(),
  dataReadinessScore: z.number().min(0).max(100),
  classification: z.enum(["READY", "NEEDS_CLEANSING", "MIGRATION_BLOCKED"]),
  cleansingActionRequired: z.array(z.string()),
});

export type DataReadinessScorecard = z.infer<typeof DataReadinessScorecardSchema>;

// 5. Migration Reconciliation Report
export const MigrationReconciliationReportSchema = z.object({
  migrationId: z.string(),
  sourceRowCount: z.number().int().nonnegative(),
  targetRowCount: z.number().int().nonnegative(),
  reconciledRowsPct: z.number().min(0).max(100),
  sourceInventoryValueUsd: z.number().nonnegative(),
  targetInventoryValueUsd: z.number().nonnegative(),
  inventoryValueVarianceUsd: z.number(),
  sourceOpeningBalanceUsd: z.number().nonnegative(),
  targetOpeningBalanceUsd: z.number().nonnegative(),
  balanceVarianceUsd: z.number(),
  reconciliationStatus: z.enum(["MATCHED", "VARIANCE_APPROVED", "RECONCILIATION_FAILED"]),
  reconciledAt: z.string(),
});

export type MigrationReconciliationReport = z.infer<typeof MigrationReconciliationReportSchema>;

// 6. Integration Certification Record (10 Tests)
export const IntegrationCertificationRecordSchema = z.object({
  integrationName: z.string(),
  targetSystem: z.string(),
  authenticationTest: z.boolean(),
  authorizationTest: z.boolean(),
  dataFormatValidationTest: z.boolean(),
  errorHandlingTest: z.boolean(),
  retryBehaviorTest: z.boolean(),
  idempotencyTest: z.boolean(),
  timeoutTest: z.boolean(),
  outageResilienceTest: z.boolean(),
  dataReconciliationTest: z.boolean(),
  tenantIsolationTest: z.boolean(),
  all10TestsPassed: z.boolean(),
  certificationStatus: z.enum(["CERTIFIED", "CONDITIONALLY_APPROVED", "FAILED"]),
  certifiedAt: z.string(),
});

export type IntegrationCertificationRecord = z.infer<typeof IntegrationCertificationRecordSchema>;

// 7. Role Training Progress & Train-the-Trainer
export const RoleTrainingProgressSchema = z.object({
  roleName: z.string(),
  totalEnrolled: z.number().int().nonnegative(),
  trainedCount: z.number().int().nonnegative(),
  certifiedChampionsCount: z.number().int().nonnegative(),
  completionRatePct: z.number().min(0).max(100),
  competencyVerified: z.boolean(),
});

export type RoleTrainingProgress = z.infer<typeof RoleTrainingProgressSchema>;

// 8. Pilot Acceptance Record
export const PilotAcceptanceRecordSchema = z.object({
  pilotId: z.string(),
  pilotBranchNames: z.array(z.string()),
  pilotUserCount: z.number().int().min(1),
  durationDays: z.number().int().min(1),
  criticalWorkflowsTested: z.array(z.string()),
  unresolvedCriticalDefectsCount: z.number().int().nonnegative(),
  workflowSuccessRatePct: z.number().min(0).max(100),
  pilotAccepted: z.boolean(),
  acceptedByCustomer: z.string().optional(),
  acceptanceDate: z.string().optional(),
});

export type PilotAcceptanceRecord = z.infer<typeof PilotAcceptanceRecordSchema>;

// 9. Go-Live Readiness Review Gate
export const GoLiveReadinessGateSchema = z.object({
  criticalWorkflowsComplete: z.boolean(),
  dataMigrationReconciled: z.boolean(),
  integrationsCertified: z.boolean(),
  usersTrained: z.boolean(),
  securityAccessValidated: z.boolean(),
  productionReliabilityConfirmed: z.boolean(),
  supportCoverageActive: z.boolean(),
  rollbackPlanDocumented: z.boolean(),
  customerExecutiveApproval: z.boolean(),
  kwakoPosLeadSignoff: z.boolean(),
  all10CriteriaPassed: z.boolean(),
  readyForGoLive: z.boolean(),
});

export type GoLiveReadinessGate = z.infer<typeof GoLiveReadinessGateSchema>;

// 10. Hypercare Stability Report
export const HypercareStabilityReportSchema = z.object({
  hypercareDaysActive: z.number().int().nonnegative(),
  openCriticalDefects: z.number().int().nonnegative(),
  openMajorIncidents: z.number().int().nonnegative(),
  transactionSuccessRatePct: z.number().min(0).max(100),
  syncHealthScorePct: z.number().min(0).max(100),
  supportTicketVolumeStabilized: z.boolean(),
  operationalCompetencyVerified: z.boolean(),
  customerSignoffCompleted: z.boolean(),
  hypercareExitEligible: z.boolean(),
});

export type HypercareStabilityReport = z.infer<typeof HypercareStabilityReportSchema>;

// 11. Success Review Report (30/60/90-Day Cadence)
export const SuccessReviewReportSchema = z.object({
  reviewPeriodDays: z.number().int(), // 30, 60, or 90
  weeklyActiveUsersCount: z.number().int().nonnegative(),
  monthlyTransactionVolume: z.number().int().nonnegative(),
  featureAdoptionRatePct: z.number().min(0).max(100),
  branchAdoptionPct: z.number().min(0).max(100),
  supportBurdenPerUserUsd: z.number().nonnegative(),
  customerSatisfactionNps: z.number().min(-100).max(100),
  roiTargetAchieved: z.boolean(),
  reviewNotes: z.string(),
});

export type SuccessReviewReport = z.infer<typeof SuccessReviewReportSchema>;

// 12. Implementation Health Score
export const ImplementationHealthScoreSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dataReadinessScore: z.number().min(0).max(100),
  configurationReadinessScore: z.number().min(0).max(100),
  integrationReadinessScore: z.number().min(0).max(100),
  trainingReadinessScore: z.number().min(0).max(100),
  pilotSuccessScore: z.number().min(0).max(100),
  userAdoptionScore: z.number().min(0).max(100),
  healthStatus: z.enum(["GREEN", "AMBER", "RED"]),
  topRisks: z.array(z.string()),
  recommendedActions: z.array(z.string()),
});

export type ImplementationHealthScore = z.infer<typeof ImplementationHealthScoreSchema>;

// 13. Industry Onboarding Kit Profile
export const IndustryOnboardingKitSchema = z.object({
  industryId: z.string(),
  industryName: z.string(),
  discoveryQuestionnaire: z.array(z.string()),
  processMap: z.array(z.string()),
  terminologyDictionary: z.record(z.string()),
  recommendedRoles: z.array(z.string()),
  permissionsMatrix: z.array(z.string()),
  uomDataTemplates: z.array(z.string()),
  migrationMappingRules: z.array(z.string()),
  integrationChecklist: z.array(z.string()),
  trainingCurriculum: z.array(z.string()),
  pilotChecklist: z.array(z.string()),
  goLiveChecklist: z.array(z.string()),
  hypercareChecklist: z.array(z.string()),
  successKpiTemplate: z.array(z.string()),
});

export type IndustryOnboardingKit = z.infer<typeof IndustryOnboardingKitSchema>;

// 14. Full Enterprise Implementation Project Master
export const EnterpriseImplementationProjectSchema = z.object({
  projectId: z.string(),
  tenantId: z.string(),
  customerName: z.string(),
  industryId: z.string(),
  currentStage: OnboardingStageEnum,
  discoveryProfile: DiscoveryProfileSchema.optional(),
  solutionBlueprint: SolutionBlueprintSchema.optional(),
  dataReadinessScorecard: DataReadinessScorecardSchema.optional(),
  migrationReconciliationReport: MigrationReconciliationReportSchema.optional(),
  integrationCertificationRecords: z.array(IntegrationCertificationRecordSchema).default([]),
  roleTrainingProgress: z.array(RoleTrainingProgressSchema).default([]),
  pilotAcceptanceRecord: PilotAcceptanceRecordSchema.optional(),
  goLiveReadinessGate: GoLiveReadinessGateSchema.optional(),
  hypercareStabilityReport: HypercareStabilityReportSchema.optional(),
  successReviewReport: SuccessReviewReportSchema.optional(),
  healthScore: ImplementationHealthScoreSchema.optional(),
  riskRegister: z.array(
    z.object({
      riskId: z.string(),
      description: z.string(),
      likelihood: z.enum(["LOW", "MEDIUM", "HIGH"]),
      impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
      mitigationPlan: z.string(),
      status: z.enum(["OPEN", "MITIGATED", "CLOSED"]),
    })
  ).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EnterpriseImplementationProject = z.infer<typeof EnterpriseImplementationProjectSchema>;
