import { z } from "zod";

// ============================================================
// KWAKOPOS V2 — ROLLBACK AUTHORIZATION POLICY CONTRACTS
// ============================================================

export const RollbackScopeEnum = z.enum([
  "RECORD",     // Level 0: Record/Transaction Correction
  "MODULE",     // Level 1: Module Rollback
  "BRANCH",     // Level 2: Branch Rollback
  "TENANT",     // Level 3: Tenant Rollback
  "PLATFORM",   // Level 4: Platform/System Rollback
  "EMERGENCY",  // Level 5: Emergency Recovery
]);
export type RollbackScope = z.infer<typeof RollbackScopeEnum>;

export const RollbackStatusEnum = z.enum([
  "DRAFT",
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "EXECUTING",
  "EXECUTED",
  "VERIFICATION_REQUIRED",
  "VERIFIED",
  "FAILED",
  "RECOVERY_REQUIRED",
  "CANCELLED",
]);
export type RollbackStatus = z.infer<typeof RollbackStatusEnum>;

export const RollbackRiskLevelEnum = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export type RollbackRiskLevel = z.infer<typeof RollbackRiskLevelEnum>;

export const RollbackTargetTypeEnum = z.enum([
  "TRANSACTION",
  "STOCK_LEDGER",
  "MODULE_STATE",
  "BRANCH_CONFIG",
  "TENANT_DATA",
  "PLATFORM_DEPLOYMENT",
  "DATABASE_MIGRATION",
]);
export type RollbackTargetType = z.infer<typeof RollbackTargetTypeEnum>;

export const RollbackImpactReportSchema = z.object({
  recordsAffected: z.number().int().nonnegative().default(0),
  transactionsAffected: z.number().int().nonnegative().default(0),
  inventoryMovementsAffected: z.number().int().nonnegative().default(0),
  stockLedgerEntriesAffected: z.number().int().nonnegative().default(0),
  customerBalancesAffected: z.number().int().nonnegative().default(0),
  financialRecordsAffected: z.number().int().nonnegative().default(0),
  financialExposureAmount: z.number().default(0),
  branchesAffected: z.array(z.string()).default([]),
  usersAffected: z.number().int().nonnegative().default(0),
  syncEventsAffected: z.number().int().nonnegative().default(0),
  activeDevicesAffected: z.number().int().nonnegative().default(0),
  externalIntegrationsAffected: z.array(z.string()).default([]),
  configurationAffected: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  blockingConditions: z.array(z.string()).default([]),
  estimatedDurationSeconds: z.number().default(5),
  recoveryRequirements: z.array(z.string()).default([]),
});
export type RollbackImpactReport = z.infer<typeof RollbackImpactReportSchema>;

export const RollbackRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  branchId: z.string().nullable().default(null),
  requestedBy: z.string().min(1),
  requesterEmail: z.string().email(),
  requesterRole: z.string().min(1),
  approvedBy: z.string().nullable().default(null),
  approverEmail: z.string().email().nullable().default(null),
  executedBy: z.string().nullable().default(null),
  rollbackScope: RollbackScopeEnum,
  targetType: RollbackTargetTypeEnum,
  targetId: z.string().min(1),
  targetVersion: z.string().default("HEAD"),
  sourceVersion: z.string().default("PREVIOUS"),
  reason: z.string().min(10, "A detailed business or operational justification is required"),
  incidentId: z.string().nullable().default(null),
  businessImpact: z.string().default(""),
  riskLevel: RollbackRiskLevelEnum,
  status: RollbackStatusEnum.default("REQUESTED"),
  authorizationState: z.enum(["PENDING", "AUTHORIZED", "REJECTED", "EXPIRED"]).default("PENDING"),
  approvalTimestamp: z.string().datetime().nullable().default(null),
  executionTimestamp: z.string().datetime().nullable().default(null),
  verificationTimestamp: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  requestHash: z.string().min(1),
  executionHash: z.string().nullable().default(null),
  recoveryPointId: z.string().nullable().default(null),
  snapshotReference: z.string().nullable().default(null),
  syncEpochBefore: z.number().int().default(1000),
  syncEpochAfter: z.number().int().nullable().default(null),
  policyVersion: z.string().default("1.0.0"),
  impactReport: RollbackImpactReportSchema.nullable().default(null),
  isEmergency: z.boolean().default(false),
  postIncidentReviewTaskId: z.string().nullable().default(null),
});
export type RollbackRequest = z.infer<typeof RollbackRequestSchema>;

export const CreateRollbackRequestPayloadSchema = z.object({
  tenantId: z.string().optional(),
  branchId: z.string().optional().nullable(),
  rollbackScope: RollbackScopeEnum,
  targetType: RollbackTargetTypeEnum,
  targetId: z.string().min(1),
  targetVersion: z.string().optional().default("HEAD"),
  sourceVersion: z.string().optional().default("PREVIOUS"),
  reason: z.string().min(10),
  incidentId: z.string().optional().nullable(),
  businessImpact: z.string().optional(),
  isEmergency: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
});
export type CreateRollbackRequestPayload = z.infer<typeof CreateRollbackRequestPayloadSchema>;

export const ApproveRollbackPayloadSchema = z.object({
  reason: z.string().min(5, "Approval justification required"),
});
export type ApproveRollbackPayload = z.infer<typeof ApproveRollbackPayloadSchema>;

export const RejectRollbackPayloadSchema = z.object({
  reason: z.string().min(5, "Rejection justification required"),
});
export type RejectRollbackPayload = z.infer<typeof RejectRollbackPayloadSchema>;

export const ExecuteRollbackPayloadSchema = z.object({
  idempotencyKey: z.string().min(1),
  confirmationPhrase: z.string().optional(), // Required for CRITICAL: "AUTHORIZE ROLLBACK"
});
export type ExecuteRollbackPayload = z.infer<typeof ExecuteRollbackPayloadSchema>;

export const EmergencyRollbackPayloadSchema = z.object({
  tenantId: z.string().optional(),
  branchId: z.string().optional().nullable(),
  rollbackScope: z.enum(["RECORD", "MODULE", "BRANCH", "TENANT", "PLATFORM", "EMERGENCY"]).default("EMERGENCY"),
  targetType: RollbackTargetTypeEnum,
  targetId: z.string().min(1),
  incidentId: z.string().min(3, "Mandatory incident reference is required for emergency rollback"),
  emergencyReason: z.string().min(15, "Comprehensive emergency justification is required"),
  recoveryPointId: z.string().optional(),
  idempotencyKey: z.string().min(1),
});
export type EmergencyRollbackPayload = z.infer<typeof EmergencyRollbackPayloadSchema>;

export const RollbackRecoveryPointSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  branchId: z.string().nullable().default(null),
  rollbackRequestId: z.string().uuid(),
  databaseVersion: z.string().default("2.12.5"),
  schemaVersion: z.string().default("2.12.5"),
  applicationVersion: z.string().default("2.12.5"),
  syncEpoch: z.number().int(),
  checksum: z.string(),
  integrityStatus: z.enum(["VALID", "CORRUPTED", "VERIFYING"]).default("VALID"),
  createdAt: z.string().datetime(),
  verifiedAt: z.string().datetime().nullable().default(null),
});
export type RollbackRecoveryPoint = z.infer<typeof RollbackRecoveryPointSchema>;

export const RollbackExecutionLockSchema = z.object({
  tenantId: z.string().min(1),
  rollbackScope: RollbackScopeEnum,
  lockOwner: z.string().min(1),
  rollbackRequestId: z.string().uuid(),
  acquiredAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type RollbackExecutionLock = z.infer<typeof RollbackExecutionLockSchema>;

export const RollbackAuditEventTypeEnum = z.enum([
  "ROLLBACK_REQUESTED",
  "ROLLBACK_REVIEWED",
  "ROLLBACK_APPROVED",
  "ROLLBACK_REJECTED",
  "ROLLBACK_EXPIRED",
  "ROLLBACK_STARTED",
  "ROLLBACK_PROGRESS",
  "ROLLBACK_COMPLETED",
  "ROLLBACK_FAILED",
  "ROLLBACK_VERIFICATION_STARTED",
  "ROLLBACK_VERIFIED",
  "ROLLBACK_RECOVERY_STARTED",
  "ROLLBACK_CANCELLED",
  "ROLLBACK_SYNC_BARRIER_ENGAGED",
  "ROLLBACK_SYNC_BARRIER_RELEASED",
  "ROLLBACK_STALE_DEVICE_REJECTED",
]);
export type RollbackAuditEventType = z.infer<typeof RollbackAuditEventTypeEnum>;

export const RollbackAuditEventSchema = z.object({
  id: z.string().uuid(),
  eventType: RollbackAuditEventTypeEnum,
  rollbackRequestId: z.string().uuid(),
  tenantId: z.string().min(1),
  branchId: z.string().nullable().default(null),
  actorId: z.string().min(1),
  actorEmail: z.string().email(),
  actorRole: z.string().min(1),
  scope: RollbackScopeEnum,
  target: z.string().min(1),
  reason: z.string().min(1),
  riskLevel: RollbackRiskLevelEnum,
  previousState: z.string().nullable().default(null),
  newState: z.string(),
  approvalReference: z.string().nullable().default(null),
  executionReference: z.string().nullable().default(null),
  result: z.enum(["SUCCESS", "FAILURE", "BLOCKED", "PENDING"]),
  errorCode: z.string().nullable().default(null),
  clientIp: z.string().default("127.0.0.1"),
  deviceId: z.string().default("system"),
  timestamp: z.string().datetime(),
  previousHash: z.string(),
  eventHash: z.string(),
});
export type RollbackAuditEvent = z.infer<typeof RollbackAuditEventSchema>;

export const RollbackVerificationReportSchema = z.object({
  rollbackRequestId: z.string().uuid(),
  databaseIntegrity: z.enum(["PASS", "FAIL"]),
  tenantIsolation: z.enum(["PASS", "FAIL"]),
  foreignKeys: z.enum(["PASS", "FAIL"]),
  transactionIntegrity: z.enum(["PASS", "FAIL"]),
  stockLedgerIntegrity: z.enum(["PASS", "FAIL"]),
  stockRecalculation: z.enum(["PASS", "FAIL"]),
  variantIntegrity: z.enum(["PASS", "FAIL"]),
  customerBalances: z.enum(["PASS", "FAIL"]),
  financialTotals: z.enum(["PASS", "FAIL"]),
  cashDrawerIntegrity: z.enum(["PASS", "FAIL"]),
  syncConvergence: z.enum(["PASS", "FAIL"]),
  auditContinuity: z.enum(["PASS", "FAIL"]),
  overallStatus: z.enum(["PASS", "FAIL"]),
  verifiedAt: z.string().datetime(),
  details: z.record(z.any()).default({}),
  failureReasons: z.array(z.string()).default([]),
});
export type RollbackVerificationReport = z.infer<typeof RollbackVerificationReportSchema>;

export const RollbackMetricsSchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  pendingRequests: z.number().int().nonnegative(),
  approvedRequests: z.number().int().nonnegative(),
  executingRequests: z.number().int().nonnegative(),
  completedRequests: z.number().int().nonnegative(),
  failedRequests: z.number().int().nonnegative(),
  recoveryRequiredRequests: z.number().int().nonnegative(),
  emergencyRequests: z.number().int().nonnegative(),
  averageExecutionTimeSeconds: z.number(),
  failureRatePercentage: z.number(),
  verificationFailureRatePercentage: z.number(),
  lastRollbackTimestamp: z.string().datetime().nullable(),
});
export type RollbackMetrics = z.infer<typeof RollbackMetricsSchema>;
