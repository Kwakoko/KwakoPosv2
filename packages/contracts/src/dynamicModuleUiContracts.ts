import { z } from "zod";

// 1. Dynamic Route Definition Schema
export const DynamicRouteDefinitionSchema = z.object({
  path: z.string(),
  componentName: z.string(),
  requiredPermissions: z.array(z.string()),
  isPublic: z.boolean().default(false),
});

export type DynamicRouteDefinition = z.infer<typeof DynamicRouteDefinitionSchema>;

// 2. Dynamic Widget Contribution Schema
export const DynamicWidgetContributionSchema = z.object({
  widgetId: z.string(),
  title: z.string(),
  size: z.enum(["SMALL", "MEDIUM", "LARGE", "FULL"]),
  refreshIntervalMs: z.number().int().nonnegative().optional(),
});

export type DynamicWidgetContribution = z.infer<typeof DynamicWidgetContributionSchema>;

// 3. Dynamic Report Contribution Schema
export const DynamicReportContributionSchema = z.object({
  reportId: z.string(),
  name: z.string(),
  category: z.string(),
  permissions: z.array(z.string()),
});

export type DynamicReportContribution = z.infer<typeof DynamicReportContributionSchema>;

// 4. Dynamic Workflow Contribution Schema
export const DynamicWorkflowContributionSchema = z.object({
  workflowId: z.string(),
  entryPoint: z.string(),
  stepsCount: z.number().int().positive(),
  permissions: z.array(z.string()),
});

export type DynamicWorkflowContribution = z.infer<typeof DynamicWorkflowContributionSchema>;

// 5. Dynamic Module UI Manifest Schema
export const DynamicModuleUiManifestSchema = z.object({
  moduleId: z.string(),
  displayName: z.string(),
  version: z.string(),
  navigation: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      path: z.string(),
      icon: z.string(),
      permissions: z.array(z.string()),
    })
  ),
  routes: z.array(DynamicRouteDefinitionSchema),
  widgets: z.array(DynamicWidgetContributionSchema).optional(),
  reports: z.array(DynamicReportContributionSchema).optional(),
  workflows: z.array(DynamicWorkflowContributionSchema).optional(),
  commands: z.array(z.string()).optional(),
  searchProviders: z.array(z.string()).optional(),
  offlineCapable: z.boolean().optional(),
  supportedPlatformVersion: z.string(),
});


export type DynamicModuleUiManifest = z.infer<typeof DynamicModuleUiManifestSchema>;

// 6. Dynamic Module Lifecycle State Schema
export const DynamicModuleLifecycleStateSchema = z.object({
  moduleId: z.string(),
  status: z.enum(["DISCOVERED", "VALIDATED", "REGISTERED", "ACTIVE", "DEGRADED", "SUSPENDED", "DISABLED", "REMOVED"]),
  lastValidatedAt: z.string(),
  healthMessage: z.string().optional(),
});

export type DynamicModuleLifecycleState = z.infer<typeof DynamicModuleLifecycleStateSchema>;

// 7. Dynamic Module UI Health Summary Schema
export const DynamicModuleUiHealthSummarySchema = z.object({
  totalRegisteredModules: z.number().int().nonnegative(),
  activeModulesCount: z.number().int().nonnegative(),
  dynamicRoutesCount: z.number().int().nonnegative(),
  dynamicWidgetsCount: z.number().int().nonnegative(),
  dynamicReportsCount: z.number().int().nonnegative(),
  coreIsolationInvariantPassing: z.boolean(),
  dynamicUiRegistryOperational: z.boolean(),
});

export type DynamicModuleUiHealthSummary = z.infer<typeof DynamicModuleUiHealthSummarySchema>;
