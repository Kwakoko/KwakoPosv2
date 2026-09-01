import { z } from "zod";

// ============================================================
// Phase 41 — KwakoPos Security & Risk Contracts (KSROL v1.0.0)
// ============================================================

export const SecurityRiskLevelEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type SecurityRiskLevel = z.infer<typeof SecurityRiskLevelEnum>;

export const ThreatTypeEnum = z.enum([
  "UNAUTHORIZED_LOGIN", "BRUTE_FORCE", "IP_MALICIOUS", "EXCESSIVE_RATE_LIMIT",
  "SUSPICIOUS_DATA_EXPORT", "CREDENTIAL_LEAK", "ANOMALOUS_API_PATTERN", "CUSTOM",
]);
export type ThreatType = z.infer<typeof ThreatTypeEnum>;

export const SecurityPolicySchema = z.object({
  policyId: z.string(),
  tenantId: z.string(),
  policyName: z.string(),
  requireMfa: z.boolean().default(true),
  ipWhitelist: z.array(z.string()).default([]),
  maxLoginAttempts: z.number().int().positive().default(5),
  sessionTimeoutMinutes: z.number().int().positive().default(30),
  passwordMinLength: z.number().int().positive().default(12),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;

export const ThreatEventSchema = z.object({
  eventId: z.string(),
  tenantId: z.string(),
  threatType: ThreatTypeEnum,
  riskLevel: SecurityRiskLevelEnum,
  sourceIp: z.string(),
  userId: z.string().optional(),
  details: z.string(),
  isMitigated: z.boolean().default(false),
  detectedAt: z.string(),
});
export type ThreatEvent = z.infer<typeof ThreatEventSchema>;

export const SecurityHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activePoliciesCount: z.number().int().nonnegative(),
  detectedThreatsCount: z.number().int().nonnegative(),
  unmitigatedThreatsCount: z.number().int().nonnegative(),
  highRiskCount: z.number().int().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type SecurityHealthSummary = z.infer<typeof SecurityHealthSummarySchema>;

export const SecurityAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "POLICY_UPDATED", "THREAT_DETECTED", "THREAT_MITIGATED", "IP_BLOCKED", "MFA_ENFORCED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type SecurityAuditEntry = z.infer<typeof SecurityAuditEntrySchema>;
