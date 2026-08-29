import { z } from "zod";

// 1. Operating Plane Schema
export const SuperAdminOperatingPlaneSchema = z.object({
  plane: z.enum(["PLATFORM_CONTROL_PLANE", "TENANT_OPERATING_PLANE"]),
  activeWorkspace: z.string(),
  adminIdentity: z.object({
    adminId: z.string(),
    email: z.string().email(),
    role: z.enum([
      "PLATFORM_ADMIN",
      "SECURITY_ADMIN",
      "RELEASE_ADMIN",
      "FINANCE_ADMIN",
      "MARKETPLACE_ADMIN",
      "AI_ADMIN",
      "CERTIFICATION_ADMIN",
      "SUPPORT_ADMIN",
    ]),
  }),
});

export type SuperAdminOperatingPlane = z.infer<typeof SuperAdminOperatingPlaneSchema>;

// 2. Tenant Management Summary Schema
export const TenantManagementSummarySchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  status: z.enum(["ACTIVE", "SUSPENDED", "TRIAL", "GRACE_PERIOD", "CLOSED"]),
  country: z.string(),
  branchesCount: z.number().int().nonnegative(),
  modulesCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export type TenantManagementSummary = z.infer<typeof TenantManagementSummarySchema>;

// 3. Super Admin Context Switch Schema (Audited Privileged Support Session)
export const SuperAdminContextSwitchSchema = z.object({
  switchId: z.string(),
  adminId: z.string(),
  tenantId: z.string(),
  reason: z.string(),
  timeLimitMinutes: z.number().int().positive().default(30),
  startedAt: z.string(),
  expiresAt: z.string(),
  isActive: z.boolean(),
});

export type SuperAdminContextSwitch = z.infer<typeof SuperAdminContextSwitchSchema>;

// 4. Platform Emergency Kill Switch Schema
export const PlatformEmergencyKillSwitchSchema = z.object({
  actionId: z.string(),
  target: z.enum(["GLOBAL_AI", "RELEASE_ROLLBACK", "PLUGIN_FREEZE", "INTEGRATION_PAUSE", "TENANT_SUSPEND"]),
  reason: z.string(),
  triggeredBy: z.string(),
  timestamp: z.string(),
  immutableAuditId: z.string(),
});

export type PlatformEmergencyKillSwitch = z.infer<typeof PlatformEmergencyKillSwitchSchema>;

// 5. Feature Flag Evaluation Schema
export const FeatureFlagEvaluationSchema = z.object({
  flagKey: z.string(),
  globalValue: z.boolean(),
  countryValue: z.boolean().optional(),
  tenantValue: z.boolean().optional(),
  branchValue: z.boolean().optional(),
  effectiveValue: z.boolean(),
  evaluationPath: z.string(),
});

export type FeatureFlagEvaluation = z.infer<typeof FeatureFlagEvaluationSchema>;

// 6. Super Admin Health Summary Schema
export const SuperAdminHealthSummarySchema = z.object({
  activeTenantsCount: z.number().int().nonnegative(),
  totalPlatformRevenue: z.number(),
  activeReleasesCount: z.number().int().nonnegative(),
  securityIncidentsCount: z.number().int().nonnegative(),
  planeIsolationInvariantPassing: z.boolean(),
  superAdminControlTowerOperational: z.boolean(),
});

export type SuperAdminHealthSummary = z.infer<typeof SuperAdminHealthSummarySchema>;
