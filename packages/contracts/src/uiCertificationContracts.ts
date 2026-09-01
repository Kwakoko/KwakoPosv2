import { z } from "zod";

// 1. UI Certification Domain Result Schema
export const UiCertificationDomainResultSchema = z.object({
  domainKey: z.enum([
    "RESPONSIVE_PWA",
    "ACCESSIBILITY_WCAG22",
    "PERMISSIONS_RBAC",
    "MULTI_TENANT_ISOLATION",
    "OFFLINE_PERSISTENCE",
    "SYNC_VISIBILITY_RECOVERY",
    "LOADING_ERROR_RECOVERY",
    "PERFORMANCE_METRICS",
    "BROWSER_DEVICE_COMPATIBILITY",
    "UPGRADE_SCHEMA_SAFETY",
    "VISUAL_REGRESSION",
    "PRODUCTION_SMOKE_TELEMETRY",
  ]),
  status: z.enum(["PASSED", "FAILED", "CONDITIONAL", "REVALIDATION_REQUIRED"]),
  passedTestsCount: z.number().int().nonnegative(),
  totalTestsCount: z.number().int().positive(),
  scorePct: z.number().min(0).max(100),
  details: z.string().optional(),
});

export type UiCertificationDomainResult = z.infer<typeof UiCertificationDomainResultSchema>;

// 2. UI Certification Evidence Record Schema
export const UiCertificationEvidenceRecordSchema = z.object({
  certificationId: z.string(),
  releaseVersion: z.string(),
  gitSha: z.string(),
  browser: z.string(),
  viewport: z.string(),
  theme: z.string(),
  domainResults: z.array(UiCertificationDomainResultSchema),
  timestamp: z.string(),
  isApproved: z.boolean(),
  reviewerId: z.string().optional(),
});

export type UiCertificationEvidenceRecord = z.infer<typeof UiCertificationEvidenceRecordSchema>;

// 3. UI Certification State Machine Schema
export const UiCertificationStateMachineSchema = z.object({
  certificationId: z.string(),
  status: z.enum(["NOT_TESTED", "TESTING", "PASSED", "FAILED", "REVIEWED", "CERTIFIED", "MONITORED", "REVALIDATION_REQUIRED"]),
  lastRevalidatedAt: z.string(),
  revalidationReason: z.string().optional(),
});

export type UiCertificationStateMachine = z.infer<typeof UiCertificationStateMachineSchema>;

// 4. UI Certification Health Summary Schema
export const UiCertificationHealthSummarySchema = z.object({
  totalCertifiedDomains: z.number().int().nonnegative(),
  passRatePct: z.number().min(0).max(100),
  activeEvidenceRecordsCount: z.number().int().nonnegative(),
  revalidationRequiredCount: z.number().int().nonnegative(),
  platformUiCertified: z.boolean(),
  kucfFrameworkOperational: z.boolean(),
});

export type UiCertificationHealthSummary = z.infer<typeof UiCertificationHealthSummarySchema>;
