import { z } from "zod";

// ============================================================
// Phase 42 — KwakoPos Autonomous Business Contracts (KABO v1.0.0)
// ============================================================

export const AutonomousAgentRoleEnum = z.enum([
  "INVENTORY_REPLENISHER", "PRICE_OPTIMIZER", "FRAUD_CONTAINER", "FINANCE_RECONCILER", "WORKFORCE_SCHEDULER",
]);
export type AutonomousAgentRole = z.infer<typeof AutonomousAgentRoleEnum>;

export const AutonomousExecutionStateEnum = z.enum(["PROPOSED", "APPROVED", "EXECUTED", "BLOCKED", "ROLLED_BACK"]);
export type AutonomousExecutionState = z.infer<typeof AutonomousExecutionStateEnum>;

export const AutonomousPolicySchema = z.object({
  policyId: z.string(),
  tenantId: z.string(),
  agentRole: AutonomousAgentRoleEnum,
  maxFinancialLimitTzs: z.number().nonnegative().default(1000000),
  requiresHumanApprovalAboveTzs: z.number().nonnegative().default(500000),
  isKillSwitchActive: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AutonomousPolicy = z.infer<typeof AutonomousPolicySchema>;

export const AutonomousActionRecordSchema = z.object({
  actionId: z.string(),
  tenantId: z.string(),
  agentRole: AutonomousAgentRoleEnum,
  targetEntityId: z.string(),
  actionDescription: z.string(),
  payloadJson: z.string().default("{}"),
  financialImpactTzs: z.number().nonnegative().default(0),
  state: AutonomousExecutionStateEnum.default("PROPOSED"),
  executedAt: z.string().optional(),
  createdAt: z.string(),
});
export type AutonomousActionRecord = z.infer<typeof AutonomousActionRecordSchema>;

export const AutonomousHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activePoliciesCount: z.number().int().nonnegative(),
  executedActionsCount: z.number().int().nonnegative(),
  pendingApprovalCount: z.number().int().nonnegative(),
  blockedActionsCount: z.number().int().nonnegative(),
  isGlobalKillSwitchActive: z.boolean(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type AutonomousHealthSummary = z.infer<typeof AutonomousHealthSummarySchema>;

export const AutonomousAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "POLICY_CONFIGURED", "ACTION_PROPOSED", "ACTION_APPROVED", "ACTION_EXECUTED",
    "ACTION_BLOCKED", "ACTION_ROLLED_BACK", "KILL_SWITCH_ACTIVATED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type AutonomousAuditEntry = z.infer<typeof AutonomousAuditEntrySchema>;
