import { z } from "zod";

// ============================================================
// Phase 45 — KwakoPos Licensing Contracts (KPLOL v1.0.0)
// ============================================================

export const SubscriptionTierEnum = z.enum(["FREE_TRIAL", "BASIC", "PRO", "ENTERPRISE", "CUSTOM"]);
export type SubscriptionTier = z.infer<typeof SubscriptionTierEnum>;

export const LicenseStatusEnum = z.enum(["ACTIVE", "GRACE_PERIOD", "EXPIRED", "SUSPENDED", "REVOKED"]);
export type LicenseStatus = z.infer<typeof LicenseStatusEnum>;

export const TenantLicenseSchema = z.object({
  licenseId: z.string(),
  tenantId: z.string(),
  tier: SubscriptionTierEnum,
  status: LicenseStatusEnum.default("ACTIVE"),
  maxBranches: z.number().int().positive().default(5),
  maxUsers: z.number().int().positive().default(20),
  enabledFeatures: z.array(z.string()).default([]),
  validFrom: z.string(),
  validUntil: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TenantLicense = z.infer<typeof TenantLicenseSchema>;

export const UsageQuotaRecordSchema = z.object({
  tenantId: z.string(),
  metricName: z.string(),
  currentUsage: z.number().nonnegative(),
  limitQuota: z.number().positive(),
  unitName: z.string(),
});
export type UsageQuotaRecord = z.infer<typeof UsageQuotaRecordSchema>;

export const LicensingHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activeLicenseTier: SubscriptionTierEnum,
  licenseStatus: LicenseStatusEnum,
  isEntitled: z.boolean(),
  quotaUtilizationPercent: z.number().min(0).max(100),
  auditEntryCount: z.number().int().nonnegative(),
});
export type LicensingHealthSummary = z.infer<typeof LicensingHealthSummarySchema>;

export const LicensingAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "LICENSE_ISSUED", "LICENSE_RENEWED", "LICENSE_SUSPENDED", "QUOTA_EXCEEDED", "FEATURE_ENTITLEMENT_CHECK",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type LicensingAuditEntry = z.infer<typeof LicensingAuditEntrySchema>;
