import { z } from "zod";

// 1. BI Metric Definition Schema
export const BiMetricDefinitionSchema = z.object({
  metricId: z.string(),
  name: z.string(),
  definition: z.string(),
  formula: z.string(),
  source: z.string(),
  dimensions: z.array(z.string()),
  freshness: z.enum(["REAL_TIME", "SHORT_LIVED_BATCH", "DAILY", "HISTORICAL"]),
  owner: z.string(),
});

export type BiMetricDefinition = z.infer<typeof BiMetricDefinitionSchema>;

// 2. BI Dimension Schema
export const BiDimensionSchema = z.object({
  dimensionId: z.string(),
  key: z.string(),
  label: z.string(),
  values: z.array(z.string()),
});

export type BiDimension = z.infer<typeof BiDimensionSchema>;

// 3. BI Fact Schema
export const BiFactSchema = z.object({
  factId: z.string(),
  entityType: z.string(),
  timestamp: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  metrics: z.record(z.number()),
});

export type BiFact = z.infer<typeof BiFactSchema>;

// 4. BI Dashboard Widget Schema
export const BiDashboardWidgetSchema = z.object({
  widgetId: z.string(),
  title: z.string(),
  type: z.enum(["KPI", "TREND", "CHART", "TABLE", "FUNNEL", "COHORT", "FORECAST"]),
  metricId: z.string(),
  refreshMs: z.number().int().positive().optional(),
});

export type BiDashboardWidget = z.infer<typeof BiDashboardWidgetSchema>;

// 5. BI AI Insight Schema
export const BiInsightSchema = z.object({
  insightId: z.string(),
  title: z.string(),
  observation: z.string(),
  evidence: z.array(z.string()),
  explanation: z.string(),
  recommendation: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type BiInsight = z.infer<typeof BiInsightSchema>;

// 6. BI Forecast Schema
export const BiForecastSchema = z.object({
  forecastId: z.string(),
  metricId: z.string(),
  targetDate: z.string(),
  predictedValue: z.number(),
  confidenceLower: z.number(),
  confidenceUpper: z.number(),
});

export type BiForecast = z.infer<typeof BiForecastSchema>;

// 7. BI Anomaly Alert Schema
export const BiAnomalyAlertSchema = z.object({
  alertId: z.string(),
  metricId: z.string(),
  expectedValue: z.number(),
  actualValue: z.number(),
  deviationPct: z.number(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  timestamp: z.string(),
});

export type BiAnomalyAlert = z.infer<typeof BiAnomalyAlertSchema>;

// 8. BI Analytics Health Summary Schema
export const BiAnalyticsHealthSummarySchema = z.object({
  totalMetricsCount: z.number().int().nonnegative(),
  totalDashboardsCount: z.number().int().nonnegative(),
  activePipelinesCount: z.number().int().nonnegative(),
  dataFreshnessPct: z.number().min(0).max(100),
  biPlatformOperational: z.boolean(),
});

export type BiAnalyticsHealthSummary = z.infer<typeof BiAnalyticsHealthSummarySchema>;
