import { z } from "zod";

// 1. Governance Risk Levels
export const GovernanceRiskLevelEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type GovernanceRiskLevel = z.infer<typeof GovernanceRiskLevelEnum>;

// 2. Architecture Decision Record (ADR) Schema
export const ArchitectureDecisionRecordSchema = z.object({
  adrId: z.string(),
  title: z.string(),
  context: z.string(),
  decision: z.string(),
  consequences: z.array(z.string()),
  status: z.enum(["PROPOSED", "ACCEPTED", "SUPERSEDED", "DEPRECATED"]),
  owner: z.string(),
  createdAt: z.string(),
});

export type ArchitectureDecisionRecord = z.infer<typeof ArchitectureDecisionRecordSchema>;

// 3. API Contract Governance Rule
export const ApiContractGovernanceRuleSchema = z.object({
  endpointId: z.string(),
  path: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  version: z.string(),
  ownerDomain: z.string(),
  hasRequestSchema: z.boolean(),
  hasResponseSchema: z.boolean(),
  hasDocumentation: z.boolean(),
  breakingChangeAllowed: z.boolean().default(false),
  securityClassification: z.enum(["PUBLIC", "AUTHENTICATED", "TENANT_ADMIN", "SUPER_ADMIN"]),
  registeredAt: z.string(),
});

export type ApiContractGovernanceRule = z.infer<typeof ApiContractGovernanceRuleSchema>;

// 4. Deprecation Registry Item
export const DeprecationRegistryItemSchema = z.object({
  deprecationId: z.string(),
  subjectName: z.string(),
  subjectType: z.enum(["API_ENDPOINT", "PLUGIN", "SCHEMA_FIELD", "SYNC_PROTOCOL", "FEATURE"]),
  deprecationStage: z.enum(["ACTIVE", "DEPRECATION_ANNOUNCED", "MIGRATION_AVAILABLE", "MAINTENANCE_ONLY", "SUNSET_WARNING", "REMOVED"]),
  replacementSubject: z.string(),
  migrationGuideUrl: z.string(),
  announcedDate: z.string(),
  sunsetDate: z.string(),
  owner: z.string(),
});

export type DeprecationRegistryItem = z.infer<typeof DeprecationRegistryItemSchema>;

// 5. Technical Debt Register Item
export const TechnicalDebtItemSchema = z.object({
  debtId: z.string(),
  title: z.string(),
  affectedComponent: z.string(),
  riskLevel: GovernanceRiskLevelEnum,
  estimatedCostUsd: z.number().nonnegative(),
  remediationPlan: z.string(),
  targetDeadline: z.string(),
  owner: z.string(),
});

export type TechnicalDebtItem = z.infer<typeof TechnicalDebtItemSchema>;

// 6. Architecture Fitness Check Result
export const ArchitectureFitnessCheckResultSchema = z.object({
  checkId: z.string(),
  passed: z.boolean(),
  noUnauthorizedRawDbAccess: z.boolean(),
  noCrossTenantDataPaths: z.boolean(),
  noUndocumentedPublicApis: z.boolean(),
  noDuplicateFinancialLedgers: z.boolean(),
  noDuplicateInventoryBalances: z.boolean(),
  noUnmanagedSecrets: z.boolean(),
  violations: z.array(z.string()),
  evaluatedAt: z.string(),
});

export type ArchitectureFitnessCheckResult = z.infer<typeof ArchitectureFitnessCheckResultSchema>;

// 7. Platform Complexity Budget Evaluation
export const PlatformComplexityBudgetSchema = z.object({
  totalServicesCount: z.number().int().nonnegative(),
  totalDatabasesCount: z.number().int().nonnegative(),
  totalQueuesCount: z.number().int().nonnegative(),
  maintenanceBurdenScore: z.number().min(0).max(100),
  isWithinApprovedEnvelope: z.boolean(),
  evaluatedAt: z.string(),
});

export type PlatformComplexityBudget = z.infer<typeof PlatformComplexityBudgetSchema>;

// 8. Platform Governance Control Tower Summary
export const PlatformGovernanceCommandCenterSummarySchema = z.object({
  totalActiveAdrs: z.number().int().nonnegative(),
  governedApiEndpointsCount: z.number().int().nonnegative(),
  deprecationRegistryItemsCount: z.number().int().nonnegative(),
  openTechnicalDebtItemsCount: z.number().int().nonnegative(),
  architectureFitnessPassRatePct: z.number().min(0).max(100),
  platformComplexityScore: z.number().min(0).max(100),
  oneCoreInvariantPassing: z.boolean(),
});

export type PlatformGovernanceCommandCenterSummary = z.infer<typeof PlatformGovernanceCommandCenterSummarySchema>;
