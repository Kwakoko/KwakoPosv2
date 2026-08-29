import { z } from "zod";

// 1. Semantic Design Token Schema
export const KdsSemanticTokenSchema = z.object({
  tokenPath: z.string(), // e.g. "color.background.default"
  category: z.enum(["COLOR", "TYPOGRAPHY", "SPACING", "RADIUS", "ELEVATION", "BORDER"]),
  lightValue: z.string(),
  darkValue: z.string(),
  highContrastValue: z.string(),
  description: z.string(),
});

export type KdsSemanticToken = z.infer<typeof KdsSemanticTokenSchema>;

// 2. Theme Configuration Schema
export const KdsThemeConfigSchema = z.object({
  themeId: z.string(),
  mode: z.enum(["LIGHT", "DARK", "HIGH_CONTRAST", "SYSTEM"]),
  brandPrimary: z.string(),
  surfaceDefault: z.string(),
  textPrimary: z.string(),
  isCustomTenantTheme: z.boolean().default(false),
});

export type KdsThemeConfig = z.infer<typeof KdsThemeConfigSchema>;

// 3. Component Primitive Schema
export const KdsComponentPrimitiveSchema = z.object({
  componentId: z.string(),
  name: z.string(),
  category: z.enum(["PRIMITIVE", "COMPOSITE", "PATTERN", "PAGE"]),
  variant: z.string(),
  accessibilityCompliance: z.enum(["WCAG_2_2_AA", "WCAG_2_2_AAA", "NON_COMPLIANT"]),
  isDeprecating: z.boolean().default(false),
  registeredAt: z.string(),
});

export type KdsComponentPrimitive = z.infer<typeof KdsComponentPrimitiveSchema>;

// 4. Design Debt Item Schema
export const KdsDesignDebtItemSchema = z.object({
  debtId: z.string(),
  title: z.string(),
  affectedModule: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  accessibilityGap: z.boolean(),
  remediationTarget: z.string(),
  owner: z.string(),
});

export type KdsDesignDebtItem = z.infer<typeof KdsDesignDebtItemSchema>;

// 5. AI Interaction Pattern Schema
export const KdsAiInteractionPatternSchema = z.object({
  patternId: z.string(),
  aiActionType: z.string(),
  requiresHumanApproval: z.boolean(),
  status: z.enum(["SUGGESTED", "APPROVED", "EXECUTING", "COMPLETED", "REJECTED"]),
  evidenceSummary: z.string(),
  verifiedBy: z.string().optional(),
});

export type KdsAiInteractionPattern = z.infer<typeof KdsAiInteractionPatternSchema>;

// 6. Design System Health Metrics Summary
export const KdsHealthMetricsSummarySchema = z.object({
  compliantInterfacesCount: z.number().int().nonnegative(),
  totalInterfacesCount: z.number().int().nonnegative(),
  tokenViolationsCount: z.number().int().nonnegative(),
  accessibilityScorePct: z.number().min(0).max(100),
  visualRegressionPassRatePct: z.number().min(0).max(100),
  openDesignDebtItemsCount: z.number().int().nonnegative(),
  oneVisualLanguageInvariantPassing: z.boolean(),
});

export type KdsHealthMetricsSummary = z.infer<typeof KdsHealthMetricsSummarySchema>;
