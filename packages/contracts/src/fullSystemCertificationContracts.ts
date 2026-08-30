import { z } from "zod";

// ============================================================
// Phase 45 — Full KwakoPos Operating System Certification Contracts (KFOS-CERT v1.0.0)
// ============================================================

export const FullSystemCertificationStatusEnum = z.enum([
  "NOT_CERTIFIED", "IN_TESTING", "FAILED", "CONDITIONALLY_CERTIFIED",
  "CERTIFIED", "REVALIDATION_REQUIRED", "SUSPENDED", "EXPIRED", "SUPERSEDED",
]);
export type FullSystemCertificationStatus = z.infer<typeof FullSystemCertificationStatusEnum>;

export const FullSystemCertificationDomainEnum = z.enum([
  "ARCHITECTURE", "SECURITY", "MULTI_TENANCY", "DATA_INTEGRITY", "FINANCE", "TREASURY",
  "INVENTORY", "SUPPLY_CHAIN", "WORKFORCE", "CRM", "POS", "PWA", "OFFLINE", "SYNCHRONIZATION",
  "UI", "DYNAMIC_MODULES", "WORKFLOW", "APPROVALS", "BI", "AI", "AUTONOMOUS_OPERATIONS",
  "INTEGRATIONS", "MARKETPLACE", "GLOBAL_PLATFORM", "RELIABILITY", "DISASTER_RECOVERY",
  "PERFORMANCE", "RELEASE_ENGINEERING", "GOVERNANCE", "COMMERCIAL_READINESS",
]);
export type FullSystemCertificationDomain = z.infer<typeof FullSystemCertificationDomainEnum>;

export const FullSystemCertificationCampaignSchema = z.object({
  campaignId: z.string(),
  releaseVersion: z.string().default("v2.5.0"),
  gitSha: z.string().length(40),
  artifactDigest: z.string().startsWith("sha256:"),
  environment: z.enum(["DEVELOPMENT", "TEST", "STAGING", "CERTIFICATION", "PRODUCTION"]).default("CERTIFICATION"),
  status: FullSystemCertificationStatusEnum.default("IN_TESTING"),
  certifiedDomainsCount: z.number().int().nonnegative().default(0),
  totalDomainsCount: z.number().int().positive().default(30),
  auditedBy: z.string().default("KwakoPos Lead Certification Auditor"),
  certifiedAt: z.string(),
});
export type FullSystemCertificationCampaign = z.infer<typeof FullSystemCertificationCampaignSchema>;

export const FullSystemCertificationHealthSummarySchema = z.object({
  tenantId: z.string(),
  authorityOperational: z.boolean(),
  activeCampaignId: z.string(),
  releaseVersion: z.string(),
  overallStatus: FullSystemCertificationStatusEnum,
  certifiedDomainsPct: z.number().min(0).max(100),
  totalCertifiedPillars: z.number().int().nonnegative(),
  auditLedgerCount: z.number().int().nonnegative(),
});
export type FullSystemCertificationHealthSummary = z.infer<typeof FullSystemCertificationHealthSummarySchema>;

export const FullSystemCertificationAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "CAMPAIGN_STARTED", "DOMAIN_CERTIFIED", "DOMAIN_FAILED",
    "REVALIDATION_TRIGGERED", "CAMPAIGN_FINALIZED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type FullSystemCertificationAuditEntry = z.infer<typeof FullSystemCertificationAuditEntrySchema>;
