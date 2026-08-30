import { z } from "zod";

// ============================================================
// Phase 43 — KwakoPos Autonomous Operations Contracts (KAOL v2.0.0)
// ============================================================

export const AutonomyMaturityLevelEnum = z.enum([
  "LEVEL_0_MANUAL", "LEVEL_1_ASSISTED", "LEVEL_2_HUMAN_APPROVED",
  "LEVEL_3_GUARDED", "LEVEL_4_CERTIFIED", "LEVEL_5_COORDINATED",
]);
export type AutonomyMaturityLevel = z.infer<typeof AutonomyMaturityLevelEnum>;

export const AutonomyRiskClassEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type AutonomyRiskClass = z.infer<typeof AutonomyRiskClassEnum>;

export const AutonomousAgentCapabilitySchema = z.object({
  agentId: z.string(),
  tenantId: z.string(),
  agentRole: z.string(),
  autonomyLevel: AutonomyMaturityLevelEnum,
  riskClass: AutonomyRiskClassEnum,
  financialLimitTzs: z.number().nonnegative().default(500000),
  rateLimitPerMin: z.number().int().positive().default(60),
  isCertified: z.boolean().default(true),
  killSwitchActive: z.boolean().default(false),
  createdAt: z.string(),
});
export type AutonomousAgentCapability = z.infer<typeof AutonomousAgentCapabilitySchema>;

export const AutonomousActionRequestSchema = z.object({
  requestId: z.string(),
  tenantId: z.string(),
  agentId: z.string(),
  capability: z.string(),
  contextJson: z.string().default("{}"),
  financialCostTzs: z.number().nonnegative().default(0),
  state: z.enum(["SUBMITTED", "AUTHORIZED", "EXECUTING", "VERIFIED", "ESCALATED", "BLOCKED", "FAILED"]),
  verificationStatus: z.enum(["UNVERIFIED", "PASSED", "FAILED"]),
  timestamp: z.string(),
});
export type AutonomousActionRequest = z.infer<typeof AutonomousActionRequestSchema>;

export const AutonomousOperationsHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activeAgentsCount: z.number().int().nonnegative(),
  level4CertifiedCount: z.number().int().nonnegative(),
  verifiedActionsCount: z.number().int().nonnegative(),
  escalatedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type AutonomousOperationsHealthSummary = z.infer<typeof AutonomousOperationsHealthSummarySchema>;

export const AutonomousOperationsAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "CAPABILITY_REGISTERED", "REQUEST_AUTHORIZED", "REQUEST_VERIFIED",
    "HUMAN_ESCALATION_TRIGGERED", "AGENT_KILL_SWITCH_ACTIVATED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type AutonomousOperationsAuditEntry = z.infer<typeof AutonomousOperationsAuditEntrySchema>;
