import { z } from "zod";

// 1. Partner Categories (7 Categories)
export const PartnerCategoryEnum = z.enum([
  "IMPLEMENTATION",
  "RESELLER",
  "SYSTEM_INTEGRATOR",
  "TECHNICAL",
  "TRAINING",
  "PAYMENT",
  "HARDWARE",
]);

export type PartnerCategory = z.infer<typeof PartnerCategoryEnum>;

// 2. Partner Tiers (5 Tiers)
export const PartnerTierEnum = z.enum([
  "REGISTERED",
  "AUTHORIZED",
  "CERTIFIED",
  "ADVANCED",
  "STRATEGIC",
]);

export type PartnerTier = z.infer<typeof PartnerTierEnum>;

// 3. Partner Profile & Due Diligence Record
export const PartnerProfileSchema = z.object({
  partnerId: z.string(),
  legalEntityName: z.string(),
  category: PartnerCategoryEnum,
  tier: PartnerTierEnum,
  territory: z.string(),
  dueDiligenceScore: z.number().min(0).max(100),
  activeCertifications: z.array(z.string()),
  industrySpecializations: z.array(z.string()),
  authorizedCustomerIds: z.array(z.string()).default([]),
  contactEmail: z.string().email(),
  contactPhone: z.string(),
  status: z.enum(["APPLICATION", "SANDBOX", "ACTIVE", "WATCH", "SUSPENDED", "TERMINATED"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PartnerProfile = z.infer<typeof PartnerProfileSchema>;

// 4. Partner Certification Record
export const PartnerCertificationRecordSchema = z.object({
  certificationId: z.string(),
  partnerId: z.string(),
  certificationType: z.enum([
    "SALES_CERTIFIED",
    "IMPLEMENTATION_CERTIFIED",
    "TECHNICAL_CERTIFIED",
    "INTEGRATION_CERTIFIED",
    "INDUSTRY_CERTIFIED",
    "SUPPORT_CERTIFIED",
  ]),
  verticalSpecialization: z.string().optional(),
  assessmentScore: z.number().min(0).max(100),
  passed: z.boolean(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  isExpired: z.boolean().default(false),
});

export type PartnerCertificationRecord = z.infer<typeof PartnerCertificationRecordSchema>;

// 5. Partner Sandbox Environment
export const PartnerSandboxEnvironmentSchema = z.object({
  sandboxId: z.string(),
  partnerId: z.string(),
  sandboxTenantId: z.string(),
  syntheticDatasetsLoaded: z.array(z.string()),
  apiCredentialsIssued: z.boolean(),
  isProductionAccess: z.boolean().default(false), // MUST be false
  createdAt: z.string(),
});

export type PartnerSandboxEnvironment = z.infer<typeof PartnerSandboxEnvironmentSchema>;

// 6. Marketplace Extension Manifest & 12 Validation Gates
export const MarketplaceExtensionManifestSchema = z.object({
  extensionId: z.string(),
  publisherPartnerId: z.string(),
  title: z.string(),
  version: z.string(),
  category: z.enum(["INTEGRATION", "ADDON", "REPORTS_PACK", "HARDWARE_DRIVER", "PAYMENT_GATEWAY"]),
  requestedPermissions: z.array(z.string()),
  supportedKwakoPosVersion: z.string(),
  offlineCompatible: z.boolean(),
  publishedStatus: z.enum(["DRAFT", "UNDER_REVIEW", "CERTIFIED_PUBLISHED", "REJECTED"]),
});

export type MarketplaceExtensionManifest = z.infer<typeof MarketplaceExtensionManifestSchema>;

export const MarketplaceExtensionGateSchema = z.object({
  manifestValidation: z.boolean(),
  permissionsCheck: z.boolean(),
  tenantIsolationCheck: z.boolean(),
  apiContractCheck: z.boolean(),
  securityAuditCheck: z.boolean(),
  dependencySafetyCheck: z.boolean(),
  performanceCheck: z.boolean(),
  offlineCompatibilityCheck: z.boolean(),
  synchronizationCheck: z.boolean(),
  dataHandlingCheck: z.boolean(),
  upgradeBehaviorCheck: z.boolean(),
  auditabilityCheck: z.boolean(),
  all12GatesPassed: z.boolean(),
});

export type MarketplaceExtensionGate = z.infer<typeof MarketplaceExtensionGateSchema>;

// 7. Scoped Partner API Token
export const PartnerScopedApiTokenSchema = z.object({
  tokenId: z.string(),
  partnerId: z.string(),
  authorizedTenantId: z.string(),
  allowedScopes: z.array(z.string()),
  rateLimitPerMinute: z.number().int().positive(),
  isRevoked: z.boolean().default(false),
  issuedAt: z.string(),
  expiresAt: z.string(),
});

export type PartnerScopedApiToken = z.infer<typeof PartnerScopedApiTokenSchema>;

// 8. Partner 3-Tier Support Escalation Path
export const PartnerSupportTicketEscalationSchema = z.object({
  ticketId: z.string(),
  partnerId: z.string(),
  customerId: z.string(),
  supportTier: z.enum(["LEVEL_1_PARTNER", "LEVEL_2_KWAKOKO_SUPPORT", "LEVEL_3_KWAKOKO_ENGINEERING"]),
  issueCategory: z.enum(["ROUTINE_OPERATIONAL", "CONFIG_TRAINING", "PLATFORM_DEFECT", "TENANT_SECURITY_INCIDENT"]),
  slaStatus: z.enum(["WITHIN_SLA", "WARNING", "BREACHED"]),
  escalatedToKwakoko: z.boolean(),
  resolvedAt: z.string().optional(),
});

export type PartnerSupportTicketEscalation = z.infer<typeof PartnerSupportTicketEscalationSchema>;

// 9. Partner Performance Scorecard & Health Score
export const PartnerPerformanceScorecardSchema = z.object({
  partnerId: z.string(),
  activeImplementationsCount: z.number().int().nonnegative(),
  successfulGoLivesCount: z.number().int().nonnegative(),
  customerRetentionPct: z.number().min(0).max(100),
  supportEscalationRatePct: z.number().min(0).max(100),
  customerSatisfactionNps: z.number().min(-100).max(100),
  healthStatus: z.enum(["EXCELLENT", "HEALTHY", "WATCH", "AT_RISK", "SUSPENDED"]),
  calculatedScore: z.number().min(0).max(100),
});

export type PartnerPerformanceScorecard = z.infer<typeof PartnerPerformanceScorecardSchema>;

// 10. Partner Capacity Metrics
export const PartnerCapacityMetricsSchema = z.object({
  totalCertifiedPartners: z.number().int().nonnegative(),
  avgImplementationsPerPartner: z.number().nonnegative(),
  totalAnnualCustomerCapacity: z.number().int().nonnegative(),
  partnerImplementedCustomerPct: z.number().min(0).max(100),
  internalHeadcountEfficiencyRatio: z.number().nonnegative(),
});

export type PartnerCapacityMetrics = z.infer<typeof PartnerCapacityMetricsSchema>;
