import type {
  PluginManifest,
  PluginRoute,
  TenantContext,
} from "@kwakopos2/contracts";

export interface ComposedNavigationItem {
  pluginId: string;
  pluginName: string;
  path: string;
  name: string;
  icon?: string;
  offlineSupport: string;
}

export class PluginNavigationEngine {
  composeNavigation(
    activePlugins: PluginManifest[],
    ctx: TenantContext
  ): ComposedNavigationItem[] {
    const items: ComposedNavigationItem[] = [];

    for (const plugin of activePlugins) {
      for (const route of plugin.routes) {
        // Check if user has required permissions for this route
        const hasPermission =
          route.requiredPermissions.length === 0 ||
          ctx.permissions.includes("*") ||
          route.requiredPermissions.some((p) => ctx.permissions.includes(p));

        if (hasPermission) {
          items.push({
            pluginId: plugin.id,
            pluginName: plugin.name,
            path: route.path,
            name: route.name,
            icon: route.icon,
            offlineSupport: route.offlineSupport,
          });
        }
      }
    }

    return items;
  }
}
