import { z } from "zod";

// 1. AI Command Center Overview Schema
export const AiCommandCenterOverviewSchema = z.object({
  overviewId: z.string(),
  tenantId: z.string(),
  activeAgentsCount: z.number().int().nonnegative(),
  pendingApprovalsCount: z.number().int().nonnegative(),
  recentActionsCount: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  modelHealthStatus: z.enum(["HEALTHY", "DEGRADED", "OFFLINE"]),
});

export type AiCommandCenterOverview = z.infer<typeof AiCommandCenterOverviewSchema>;

// 2. AI Insight Record Schema
export const AiInsightRecordSchema = z.object({
  insightId: z.string(),
  title: z.string(),
  observation: z.string(),
  evidence: z.array(z.string()),
  interpretation: z.string(),
  impact: z.string(),
  recommendedNextStep: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type AiInsightRecord = z.infer<typeof AiInsightRecordSchema>;

// 3. AI Recommendation Schema
export const AiRecommendationSchema = z.object({
  recommendationId: z.string(),
  title: z.string(),
  summary: z.string(),
  evidence: z.array(z.string()),
  expectedImpact: z.string(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  policyStatus: z.enum(["VALIDATED", "REJECTED"]),
  approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  createdAt: z.string(),
});

export type AiRecommendation = z.infer<typeof AiRecommendationSchema>;

// 4. AI Tool Definition Schema
export const AiToolDefinitionSchema = z.object({
  toolId: z.string(),
  name: z.string(),
  inputSchema: z.record(z.any()),
  outputSchema: z.record(z.any()),
  permission: z.string(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  owner: z.string(),
});

export type AiToolDefinition = z.infer<typeof AiToolDefinitionSchema>;

// 5. AI Agent Definition Schema
export const AiAgentDefinitionSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  purpose: z.string(),
  permissions: z.array(z.string()),
  tools: z.array(z.string()),
  autonomyLevel: z.enum(["SUGGEST", "RECOMMEND", "APPROVE", "GUARDED", "AUTONOMOUS"]),
});

export type AiAgentDefinition = z.infer<typeof AiAgentDefinitionSchema>;

// 6. AI Operating Health Summary Schema
export const AiOperatingHealthSummarySchema = z.object({
  activeAgentsCount: z.number().int().nonnegative(),
  totalToolsCount: z.number().int().nonnegative(),
  pendingApprovalsCount: z.number().int().nonnegative(),
  ledgerEntriesCount: z.number().int().nonnegative(),
  killSwitchActive: z.boolean(),
  aiPlatformOperational: z.boolean(),
});

export type AiOperatingHealthSummary = z.infer<typeof AiOperatingHealthSummarySchema>;
