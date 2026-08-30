import { z } from "zod";

// ============================================================
// Phase 42 — KwakoPos Security Operating Layer Contracts (KSOL v2.0.0)
// ============================================================

export const SecurityThreatSeverityEnum = z.enum(["INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type SecurityThreatSeverity = z.infer<typeof SecurityThreatSeverityEnum>;

export const SecurityIncidentStateEnum = z.enum(["DETECTED", "TRIAGED", "CONTAINED", "INVESTIGATING", "REMEDIATED", "CLOSED"]);
export type SecurityIncidentState = z.infer<typeof SecurityIncidentStateEnum>;

export const SecurityThreatAlertSchema = z.object({
  alertId: z.string(),
  tenantId: z.string(),
  threatType: z.enum([
    "UNAUTHORIZED_CROSS_TENANT_ACCESS", "BRUTE_FORCE_AUTH", "CREDENTIAL_EXPOSURE",
    "PRIVILEGE_ESCALATION", "API_ABUSE_ANOMALY", "MALICIOUS_PLUGIN_BEHAVIOR", "PROMPT_INJECTION",
  ]),
  severity: SecurityThreatSeverityEnum,
  actorId: z.string().default("UNKNOWN"),
  sourceIp: z.string().default("0.0.0.0"),
  targetResource: z.string(),
  evidenceJson: z.string().default("{}"),
  state: SecurityIncidentStateEnum.default("DETECTED"),
  timestamp: z.string(),
});
export type SecurityThreatAlert = z.infer<typeof SecurityThreatAlertSchema>;

export const SecurityKillSwitchStateSchema = z.object({
  tenantId: z.string(),
  isGlobalKillSwitchActive: z.boolean().default(false),
  isAiKillSwitchActive: z.boolean().default(false),
  isMarketplaceKillSwitchActive: z.boolean().default(false),
  isIntegrationKillSwitchActive: z.boolean().default(false),
  updatedAt: z.string(),
});
export type SecurityKillSwitchState = z.infer<typeof SecurityKillSwitchStateSchema>;

export const PlatformSecurityHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activeAlertsCount: z.number().int().nonnegative(),
  criticalIncidentsCount: z.number().int().nonnegative(),
  containedIncidentsCount: z.number().int().nonnegative(),
  tenantIsolationVerified: z.boolean(),
  isKillSwitchActive: z.boolean(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type PlatformSecurityHealthSummary = z.infer<typeof PlatformSecurityHealthSummarySchema>;

export const PlatformSecurityAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "THREAT_ALERT_TRIGGERED", "INCIDENT_CONTAINED", "TENANT_ISOLATION_EVALUATED",
    "KILL_SWITCH_ACTIVATED", "SECURITY_POLICY_ENFORCED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type PlatformSecurityAuditEntry = z.infer<typeof PlatformSecurityAuditEntrySchema>;
