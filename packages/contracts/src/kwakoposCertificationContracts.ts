import { z } from "zod";

// 1. Certification Categories (5 Schemes)
export const CertificationCategoryEnum = z.enum([
  "KWAKOPOS_CERTIFIED_RELEASE",
  "KWAKOPOS_CERTIFIED_PLUGIN",
  "KWAKOPOS_CERTIFIED_INTEGRATION",
  "KWAKOPOS_CERTIFIED_PARTNER",
  "KWAKOPOS_ENTERPRISE_CERTIFIED",
]);

export type CertificationCategory = z.infer<typeof CertificationCategoryEnum>;

// 2. Certification Levels (4 Levels)
export const CertificationLevelEnum = z.enum([
  "FOUNDATION",
  "VERIFIED",
  "ADVANCED",
  "ENTERPRISE",
]);

export type CertificationLevel = z.infer<typeof CertificationLevelEnum>;

// 3. Certification Status
export const CertificationStatusEnum = z.enum([
  "ACTIVE",
  "EXPIRED",
  "SUSPENDED",
  "REVOKED",
  "SUPERSEDED",
  "REVALIDATION_REQUIRED",
]);

export type CertificationStatus = z.infer<typeof CertificationStatusEnum>;

// 4. Immutable Evidence Item
export const CertificationEvidenceItemSchema = z.object({
  evidenceId: z.string(),
  evidenceType: z.enum(["TEST_SUITE", "SECURITY_SCAN", "TENANT_ISOLATION", "FINANCIAL_RECONCILIATION", "GO_LIVE_ACCEPTANCE"]),
  summary: z.string(),
  passed: z.boolean(),
  evidenceHash: z.string(),
  recordedAt: z.string(),
});

export type CertificationEvidenceItem = z.infer<typeof CertificationEvidenceItemSchema>;

// 5. Machine-Readable Certification Record
export const CertificationRecordSchema = z.object({
  certificationId: z.string(),
  category: CertificationCategoryEnum,
  level: CertificationLevelEnum,
  subjectName: z.string(),
  subjectVersion: z.string(),
  scopeDescription: z.string(),
  gitSha: z.string().optional(),
  artifactDigest: z.string().optional(),
  evidenceSet: z.array(CertificationEvidenceItemSchema),
  status: CertificationStatusEnum,
  issuedDate: z.string(),
  expiryDate: z.string(),
  issuedByAuthority: z.string().default("KwakoPos Certification Authority (KCA)"),
  approvedBy: z.string(),
});

export type CertificationRecord = z.infer<typeof CertificationRecordSchema>;

// 6. Certification Impact Analysis Result
export const CertificationImpactAnalysisSchema = z.object({
  analysisId: z.string(),
  changedComponent: z.string(),
  changeRiskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  affectedCertifications: z.array(z.string()),
  requiredRecertificationScope: z.enum(["NONE", "PARTIAL", "FULL"]),
  recommendedAction: z.string(),
  evaluatedAt: z.string(),
});

export type CertificationImpactAnalysis = z.infer<typeof CertificationImpactAnalysisSchema>;

// 7. Verifiable Certification Badge Metadata
export const CertificationBadgeSchema = z.object({
  badgeId: z.string(),
  certificationId: z.string(),
  badgeTitle: z.string(),
  issuer: z.string(),
  status: CertificationStatusEnum,
  verificationUrl: z.string(),
  cryptographicSignature: z.string(),
});

export type CertificationBadge = z.infer<typeof CertificationBadgeSchema>;

// 8. Certification Authority Control Tower Summary
export const CertificationCommandCenterSummarySchema = z.object({
  totalActiveCertifications: z.number().int().nonnegative(),
  certifiedReleasesCount: z.number().int().nonnegative(),
  certifiedPluginsCount: z.number().int().nonnegative(),
  certifiedIntegrationsCount: z.number().int().nonnegative(),
  certifiedPartnersCount: z.number().int().nonnegative(),
  enterpriseCertificationsCount: z.number().int().nonnegative(),
  revalidationRequiredCount: z.number().int().nonnegative(),
  suspendedOrRevokedCount: z.number().int().nonnegative(),
  certificationPassRatePct: z.number().min(0).max(100),
});

export type CertificationCommandCenterSummary = z.infer<typeof CertificationCommandCenterSummarySchema>;
