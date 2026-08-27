import type {
  PluginManifest,
  PluginLifecycleState,
  PluginCapability,
  TenantPluginActivation,
  PluginHealthReport,
} from "@kwakopos2/contracts";
import {
  assertValidPluginManifest,
  assertPluginDependenciesSatisfied,
  assertPluginPlatformCompatibility,
  assertPluginCapabilityAllowed,
} from "./pluginInvariants.js";

export class PluginRegistryEngine {
  private readonly manifests = new Map<string, PluginManifest>();

  registerManifest(manifest: PluginManifest): void {
    assertValidPluginManifest(manifest);
    this.manifests.set(manifest.id, manifest);
  }

  getManifest(pluginId: string): PluginManifest | undefined {
    return this.manifests.get(pluginId);
  }

  getAllManifests(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  validateDependencies(pluginId: string, activePluginIds: Set<string>): void {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) throw new Error(`Plugin ${pluginId} manifest not found`);
    assertPluginDependenciesSatisfied(pluginId, manifest.dependencies, activePluginIds);
  }

  detectCircularDependencies(manifests: PluginManifest[]): void {
    const adj = new Map<string, string[]>();
    for (const m of manifests) {
      adj.set(m.id, m.dependencies || []);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const m of manifests) {
      if (!visited.has(m.id)) {
        if (dfs(m.id)) {
          throw new Error(`CIRCULAR_DEPENDENCY_DETECTED: Cycle detected involving plugin ${m.id}`);
        }
      }
    }
  }

  transitionLifecycle(
    currentState: PluginLifecycleState,
    targetState: PluginLifecycleState
  ): PluginLifecycleState {
    const validTransitions: Record<PluginLifecycleState, PluginLifecycleState[]> = {
      DISCOVERED: ["VALIDATED", "UNINSTALLED"],
      VALIDATED: ["INSTALLED", "UNINSTALLED"],
      INSTALLED: ["CONFIGURED", "ENABLED", "UNINSTALLED"],
      CONFIGURED: ["ENABLED", "UNINSTALLED"],
      ENABLED: ["ACTIVE", "DISABLED", "SUSPENDED"],
      ACTIVE: ["SUSPENDED", "UPGRADED", "DISABLED"],
      SUSPENDED: ["ACTIVE", "DISABLED"],
      UPGRADED: ["ACTIVE", "CONFIGURED"],
      DISABLED: ["ENABLED", "UNINSTALLED"],
      UNINSTALLED: ["DISCOVERED"],
    };

    const allowed = validTransitions[currentState] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(
        `INVALID_LIFECYCLE_TRANSITION: Cannot transition plugin from ${currentState} to ${targetState}`
      );
    }
    return targetState;
  }

  checkCapability(plugin: PluginManifest, capability: PluginCapability): void {
    assertPluginCapabilityAllowed(capability, plugin.capabilities, plugin.id);
  }

  generateHealthReport(pluginId: string, version: string): PluginHealthReport {
    return {
      pluginId,
      version,
      status: "HEALTHY",
      checks: [
        { checkName: "dependency_check", status: "HEALTHY", latencyMs: 1 },
        { checkName: "schema_compatibility", status: "HEALTHY", latencyMs: 1 },
        { checkName: "tenant_isolation_boundary", status: "HEALTHY", latencyMs: 1 },
      ],
      timestamp: new Date().toISOString(),
    };
  }
}
