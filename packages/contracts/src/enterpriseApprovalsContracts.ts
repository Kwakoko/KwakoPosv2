import { z } from "zod";

// ============================================================
// Phase 34 — Enterprise Approvals Contracts (KEAE v1.0.0)
// ============================================================

// 1. Approval Request Status
export const ApprovalStatusEnum = z.enum([
  "DRAFT",
  "PENDING",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "ESCALATED",
  "EXPIRED",
  "CANCELLED",
  "EXECUTING",
  "EXECUTION_FAILED",
  "VERIFICATION_FAILED",
  "COMPLETE",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;

// 2. Approval Risk Classification
export const ApprovalRiskLevelEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type ApprovalRiskLevel = z.infer<typeof ApprovalRiskLevelEnum>;

// 3. Approval Action Domain
export const ApprovalDomainEnum = z.enum([
  "FINANCE",
  "INVENTORY",
  "PROCUREMENT",
  "DISCOUNT",
  "REFUND",
  "CUSTOMER_CREDIT",
  "LOAN",
  "WORKFORCE",
  "SECURITY",
  "PLATFORM",
  "AI",
  "PARTNER",
  "ENTERPRISE_ONBOARDING",
]);
export type ApprovalDomain = z.infer<typeof ApprovalDomainEnum>;

// 4. Approval Mode
export const ApprovalModeEnum = z.enum([
  "SINGLE",
  "SEQUENTIAL",
  "PARALLEL",
  "QUORUM",
  "CONDITIONAL",
  "AUTONOMOUS",
  "EMERGENCY",
  "BREAK_GLASS",
]);
export type ApprovalMode = z.infer<typeof ApprovalModeEnum>;

// 5. Blast Radius Scope
export const ApprovalBlastRadiusEnum = z.enum([
  "RECORD",
  "BRANCH",
  "TENANT",
  "COUNTRY",
  "PLATFORM",
]);
export type ApprovalBlastRadius = z.infer<typeof ApprovalBlastRadiusEnum>;

// 6. Approval Policy Record
export const ApprovalPolicySchema = z.object({
  policyId: z.string(),
  policyVersion: z.string(),
  domain: ApprovalDomainEnum,
  actionCode: z.string(),
  riskLevel: ApprovalRiskLevelEnum,
  approvalMode: ApprovalModeEnum,
  requiredApproverRoles: z.array(z.string()),
  quorumCount: z.number().int().nonnegative().optional(),
  thresholdAmount: z.number().nonnegative().optional(),
  thresholdCurrency: z.string().optional(),
  blastRadius: ApprovalBlastRadiusEnum,
  allowSelfApproval: z.boolean().default(false),
  autoApproveIfBelowThreshold: z.boolean().default(false),
  slaHours: z.number().positive().default(24),
  escalationHours: z.number().positive().default(48),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().optional(),
  isActive: z.boolean().default(true),
  policyInheritedFrom: z.string().optional(),
});
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

// 7. Approval Stage (one step in multi-level approval)
export const ApprovalStageSchema = z.object({
  stageIndex: z.number().int().nonnegative(),
  stageName: z.string(),
  requiredApproverRoles: z.array(z.string()),
  approverIds: z.array(z.string()),
  approvedBy: z.array(z.string()).default([]),
  rejectedBy: z.array(z.string()).default([]),
  quorumRequired: z.number().int().nonnegative().default(1),
  status: ApprovalStatusEnum,
  completedAt: z.string().optional(),
});
export type ApprovalStage = z.infer<typeof ApprovalStageSchema>;

// 8. Approval Decision Record (per-approver decision)
export const ApprovalDecisionSchema = z.object({
  decisionId: z.string(),
  approvalRequestId: z.string(),
  approverId: z.string(),
  approverRole: z.string(),
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
  comments: z.string().optional(),
  policyVersionAtDecision: z.string(),
  requestVersionAtDecision: z.number().int().nonnegative(),
  decidedAt: z.string(),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

// 9. Approval Evidence Item
export const ApprovalEvidenceSchema = z.object({
  evidenceId: z.string(),
  label: z.string(),
  value: z.string(),
  source: z.string(),
  verified: z.boolean().default(false),
});
export type ApprovalEvidence = z.infer<typeof ApprovalEvidenceSchema>;

// 10. Approval Delegation Record
export const ApprovalDelegationSchema = z.object({
  delegationId: z.string(),
  originalApproverId: z.string(),
  delegateId: z.string(),
  scope: z.string(),
  validFrom: z.string(),
  validUntil: z.string(),
  isActive: z.boolean().default(true),
  reason: z.string(),
  createdAt: z.string(),
});
export type ApprovalDelegation = z.infer<typeof ApprovalDelegationSchema>;

// 11. Approval Revision (for change tracking)
export const ApprovalRevisionSchema = z.object({
  revisionNumber: z.number().int().positive(),
  changedAt: z.string(),
  changedByUserId: z.string(),
  changeReason: z.string(),
  snapshotSummary: z.string(),
  materialChange: z.boolean().default(false),
});
export type ApprovalRevision = z.infer<typeof ApprovalRevisionSchema>;

// 12. Approval Audit Entry (immutable lifecycle record)
export const ApprovalAuditEntrySchema = z.object({
  auditId: z.string(),
  approvalRequestId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "CREATED",
    "SUBMITTED",
    "POLICY_EVALUATED",
    "APPROVERS_RESOLVED",
    "DECISION_RECORDED",
    "ESCALATED",
    "DELEGATED",
    "EXPIRED",
    "CANCELLED",
    "EXECUTION_STARTED",
    "EXECUTION_COMPLETED",
    "EXECUTION_FAILED",
    "VERIFIED",
    "VERIFICATION_FAILED",
    "COMPLETE",
  ]),
  actorId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type ApprovalAuditEntry = z.infer<typeof ApprovalAuditEntrySchema>;

// 13. Core Approval Request Object
export const ApprovalRequestSchema = z.object({
  approvalId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  requesterId: z.string(),
  requesterRole: z.string(),
  subject: z.string(),
  domain: ApprovalDomainEnum,
  actionCode: z.string(),
  actionDescription: z.string(),
  amountValue: z.number().optional(),
  amountCurrency: z.string().optional(),
  businessContext: z.string(),
  evidence: z.array(ApprovalEvidenceSchema).default([]),
  policyMatched: z.string().optional(),
  policyVersion: z.string().optional(),
  stages: z.array(ApprovalStageSchema).default([]),
  currentStageIndex: z.number().int().nonnegative().default(0),
  approvalMode: ApprovalModeEnum,
  riskLevel: ApprovalRiskLevelEnum,
  blastRadius: ApprovalBlastRadiusEnum,
  status: ApprovalStatusEnum,
  revisions: z.array(ApprovalRevisionSchema).default([]),
  currentRevision: z.number().int().nonnegative().default(1),
  isLocked: z.boolean().default(false),
  expiresAt: z.string().optional(),
  executionStatus: z.enum(["NOT_STARTED", "PENDING", "EXECUTING", "COMPLETE", "FAILED"]).default("NOT_STARTED"),
  executionRef: z.string().optional(),
  verificationStatus: z.enum(["NOT_STARTED", "VERIFIED", "FAILED"]).default("NOT_STARTED"),
  auditRef: z.string().optional(),
  aiAssisted: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// 14. Approval Health Summary
export const ApprovalHealthSummarySchema = z.object({
  totalPolicies: z.number().int().nonnegative(),
  totalRequests: z.number().int().nonnegative(),
  pendingRequests: z.number().int().nonnegative(),
  approvedRequests: z.number().int().nonnegative(),
  rejectedRequests: z.number().int().nonnegative(),
  escalatedRequests: z.number().int().nonnegative(),
  expiredRequests: z.number().int().nonnegative(),
  totalDelegations: z.number().int().nonnegative(),
  totalAuditEntries: z.number().int().nonnegative(),
  healthStatus: z.enum(["HEALTHY", "WARNING", "AT_RISK", "CRITICAL"]),
  approvalEngineOperational: z.boolean(),
});
export type ApprovalHealthSummary = z.infer<typeof ApprovalHealthSummarySchema>;
