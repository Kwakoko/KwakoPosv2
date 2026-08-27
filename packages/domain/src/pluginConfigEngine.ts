import type {
  PluginConfigurationEntry,
  PluginConfigScope,
  TenantContext,
} from "@kwakopos2/contracts";

export class PluginConfigEngine {
  /**
   * Resolves effective configuration by cascading through hierarchy:
   * Global Default -> Tenant -> Branch -> User Preference.
   */
  resolveConfiguration(
    key: string,
    entries: PluginConfigurationEntry[],
    context: { tenantId?: string; branchId?: string; userId?: string }
  ): unknown | undefined {
    // 1. User Scope
    if (context.userId) {
      const userMatch = entries.find(
        (e) => e.key === key && e.scope === "USER" && e.userId === context.userId
      );
      if (userMatch !== undefined) return userMatch.value;
    }

    // 2. Branch Scope
    if (context.branchId && context.tenantId) {
      const branchMatch = entries.find(
        (e) => e.key === key && e.scope === "BRANCH" && e.branchId === context.branchId && e.tenantId === context.tenantId
      );
      if (branchMatch !== undefined) return branchMatch.value;
    }

    // 3. Tenant Scope
    if (context.tenantId) {
      const tenantMatch = entries.find(
        (e) => e.key === key && e.scope === "TENANT" && e.tenantId === context.tenantId
      );
      if (tenantMatch !== undefined) return tenantMatch.value;
    }

    // 4. Global Scope
    const globalMatch = entries.find((e) => e.key === key && e.scope === "GLOBAL");
    return globalMatch?.value;
  }
}
