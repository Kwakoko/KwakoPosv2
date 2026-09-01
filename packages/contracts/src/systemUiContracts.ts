import { z } from "zod";

// 1. Design Token Theme Schema
export const DesignTokenThemeSchema = z.object({
  themeId: z.string(),
  name: z.enum(["LIGHT", "DARK", "SYSTEM", "HIGH_CONTRAST"]),
  primaryColor: z.string(), // HSL / Hex
  surfaceColor: z.string(),
  textPrimary: z.string(),
  fontFamily: z.string(),
  borderRadiusRem: z.number().nonnegative(),
  elevationShadows: z.array(z.string()),
});

export type DesignTokenTheme = z.infer<typeof DesignTokenThemeSchema>;

// 2. Navigation Item Schema
export type NavigationItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
  requiredPermissions: string[];
  badgeCount?: number;
  activeModule: string;
  subItems?: NavigationItem[];
};

export const NavigationItemSchema: z.ZodType<NavigationItem> = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  path: z.string(),
  requiredPermissions: z.array(z.string()),
  badgeCount: z.number().int().nonnegative().optional(),
  activeModule: z.string(),
  subItems: z.array(z.lazy(() => NavigationItemSchema)).optional(),
});


// 3. Module UI Contract Schema
export const ModuleUiContractSchema = z.object({
  moduleId: z.string(),
  displayName: z.string(),
  icon: z.string(),
  routes: z.array(z.string()),
  permissions: z.array(z.string()),
  dashboardWidgets: z.array(z.string()),
  searchProviders: z.array(z.string()),
  hasMobileViews: z.boolean(),
  registeredAt: z.string(),
});

export type ModuleUiContract = z.infer<typeof ModuleUiContractSchema>;

// 4. Command Palette Action Schema
export const CommandPaletteActionSchema = z.object({
  actionId: z.string(),
  title: z.string(),
  category: z.enum(["NAVIGATION", "CREATE", "SETTINGS", "ACTIONS", "SEARCH"]),
  shortcut: z.string().optional(),
  requiredPermission: z.string().optional(),
  targetPath: z.string(),
});

export type CommandPaletteAction = z.infer<typeof CommandPaletteActionSchema>;

// 5. Global Search Result Schema
export const GlobalSearchResultSchema = z.object({
  query: z.string(),
  totalMatches: z.number().int().nonnegative(),
  matches: z.array(
    z.object({
      entityType: z.enum(["PRODUCT", "CUSTOMER", "SUPPLIER", "SALE", "INVOICE", "BRANCH", "MODULE", "DOCUMENT"]),
      id: z.string(),
      title: z.string(),
      subtitle: z.string(),
      path: z.string(),
      tenantId: z.string(),
      branchId: z.string(),
    })
  ),
  executedAt: z.string(),
});

export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>;

// 6. System UI Command Center Summary
export const SystemUiCommandCenterSummarySchema = z.object({
  totalRegisteredModules: z.number().int().nonnegative(),
  navigationTreeDepth: z.number().int().nonnegative(),
  activeTheme: z.string(),
  designSystemTokensCount: z.number().int().nonnegative(),
  globalSearchIndexEntitiesCount: z.number().int().nonnegative(),
  offlineSyncState: z.enum(["ONLINE", "OFFLINE", "SYNCING", "COMPLETED", "CONFLICT_DETECTED"]),
  oneShellInvariantPassing: z.boolean(),
  accessibilityScorePct: z.number().min(0).max(100),
});

export type SystemUiCommandCenterSummary = z.infer<typeof SystemUiCommandCenterSummarySchema>;
