import { z } from "zod";

// ============================================================
// Phase 44 — KwakoPos Multi-Site Contracts (KMAOL v1.0.0)
// ============================================================

export const OrganizationLevelEnum = z.enum(["HOLDING_COMPANY", "SUBSIDIARY", "REGION", "BRANCH"]);
export type OrganizationLevel = z.infer<typeof OrganizationLevelEnum>;

export const OrganizationNodeSchema = z.object({
  nodeId: z.string(),
  tenantId: z.string(),
  parentId: z.string().optional(),
  name: z.string(),
  level: OrganizationLevelEnum,
  countryId: z.string().default("TZ"),
  currency: z.string().default("TZS"),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrganizationNode = z.infer<typeof OrganizationNodeSchema>;

export const ConsolidatedMetricRecordSchema = z.object({
  recordId: z.string(),
  tenantId: z.string(),
  nodeId: z.string(),
  periodDate: z.string(),
  totalSalesVolume: z.number().nonnegative(),
  totalNetProfit: z.number(),
  activeEmployeeCount: z.number().int().nonnegative(),
  calculatedAt: z.string(),
});
export type ConsolidatedMetricRecord = z.infer<typeof ConsolidatedMetricRecordSchema>;

export const MultiSiteHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  totalNodesCount: z.number().int().nonnegative(),
  subsidiariesCount: z.number().int().nonnegative(),
  branchesCount: z.number().int().nonnegative(),
  totalConsolidatedSalesVolume: z.number().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type MultiSiteHealthSummary = z.infer<typeof MultiSiteHealthSummarySchema>;

export const MultiSiteAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "ORGANIZATION_NODE_CREATED", "ORGANIZATION_NODE_UPDATED", "METRICS_CONSOLIDATED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type MultiSiteAuditEntry = z.infer<typeof MultiSiteAuditEntrySchema>;
