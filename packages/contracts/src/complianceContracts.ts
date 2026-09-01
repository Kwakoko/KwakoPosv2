import { z } from "zod";

// ============================================================
// Phase 43 — KwakoPos Compliance Contracts (KCAOL v1.0.0)
// ============================================================

export const ComplianceStatusEnum = z.enum(["COMPLIANT", "NON_COMPLIANT", "PENDING_REVIEW", "EXEMPT"]);
export type ComplianceStatus = z.infer<typeof ComplianceStatusEnum>;

export const ComplianceFrameworkEnum = z.enum([
  "TRA_EFDMS_TZ", "GDPR", "DATA_PROTECTION_ACT_TZ", "SOC2_TYPE2", "ISO27001", "CUSTOM",
]);
export type ComplianceFramework = z.infer<typeof ComplianceFrameworkEnum>;

export const ComplianceRuleSchema = z.object({
  ruleId: z.string(),
  tenantId: z.string(),
  framework: ComplianceFrameworkEnum,
  ruleName: z.string(),
  description: z.string(),
  status: ComplianceStatusEnum.default("COMPLIANT"),
  evaluatedAt: z.string(),
});
export type ComplianceRule = z.infer<typeof ComplianceRuleSchema>;

export const ImmutableAuditRecordSchema = z.object({
  recordId: z.string(),
  tenantId: z.string(),
  moduleName: z.string(),
  action: z.string(),
  actorId: z.string(),
  resourceId: z.string(),
  previousHash: z.string(),
  currentHash: z.string(),
  timestamp: z.string(),
});
export type ImmutableAuditRecord = z.infer<typeof ImmutableAuditRecordSchema>;

export const ComplianceHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  totalRulesCount: z.number().int().nonnegative(),
  compliantRulesCount: z.number().int().nonnegative(),
  nonCompliantRulesCount: z.number().int().nonnegative(),
  auditLogChainVerified: z.boolean(),
  totalAuditRecordsCount: z.number().int().nonnegative(),
});
export type ComplianceHealthSummary = z.infer<typeof ComplianceHealthSummarySchema>;
