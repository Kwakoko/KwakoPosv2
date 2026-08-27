import { describe, it, expect } from "vitest";
import {
  PluginRegistryEngine,
  PluginConfigEngine,
  PluginWorkflowEngine,
  PluginNavigationEngine,
  PluginDashboardEngine,
  StandardPluginCatalog,
} from "@kwakopos2/domain";
import type { TenantContext, PluginConfigurationEntry } from "@kwakopos2/contracts";

describe("Plugin Framework & Runtime Engines", () => {
  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["MANAGER"],
    permissions: ["restaurant.tables.view"],
  };

  it("registers catalog manifests and validates dependencies", () => {
    const registry = new PluginRegistryEngine();
    for (const manifest of StandardPluginCatalog) {
      registry.registerManifest(manifest);
    }
    expect(registry.getAllManifests().length).toBeGreaterThanOrEqual(6);

    const activeSet = new Set(["commercial-core", "inventory", "finance", "workforce"]);
    expect(() => registry.validateDependencies("restaurant", activeSet)).not.toThrow();
  });

  it("detects circular dependencies in plugin graphs", () => {
    const registry = new PluginRegistryEngine();
    const cyclicManifests: any[] = [
      { id: "A", name: "A", version: "1.0.0", industry: "Test", dependencies: ["B"] },
      { id: "B", name: "B", version: "1.0.0", industry: "Test", dependencies: ["A"] },
    ];
    expect(() => registry.detectCircularDependencies(cyclicManifests)).toThrow(
      /CIRCULAR_DEPENDENCY_DETECTED/
    );
  });

  it("enforces plugin lifecycle state transitions", () => {
    const registry = new PluginRegistryEngine();
    expect(registry.transitionLifecycle("DISCOVERED", "VALIDATED")).toBe("VALIDATED");
    expect(registry.transitionLifecycle("VALIDATED", "INSTALLED")).toBe("INSTALLED");
    expect(registry.transitionLifecycle("INSTALLED", "ENABLED")).toBe("ENABLED");
    expect(registry.transitionLifecycle("ENABLED", "ACTIVE")).toBe("ACTIVE");
    expect(registry.transitionLifecycle("ACTIVE", "DISABLED")).toBe("DISABLED");

    expect(() => registry.transitionLifecycle("DISCOVERED", "ACTIVE")).toThrow(
      /INVALID_LIFECYCLE_TRANSITION/
    );
  });

  it("resolves hierarchical configuration cascading correctly", () => {
    const configEngine = new PluginConfigEngine();
    const entries: PluginConfigurationEntry[] = [
      {
        id: "1",
        pluginId: "restaurant",
        scope: "GLOBAL",
        key: "tableCount",
        value: 10,
        tenantId: null,
        branchId: null,
        userId: null,
        version: 1,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        pluginId: "restaurant",
        scope: "TENANT",
        key: "tableCount",
        value: 20,
        tenantId: ctx.tenantId,
        branchId: null,
        userId: null,
        version: 1,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "3",
        pluginId: "restaurant",
        scope: "BRANCH",
        key: "tableCount",
        value: 30,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        userId: null,
        version: 1,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "4",
        pluginId: "restaurant",
        scope: "USER",
        key: "tableCount",
        value: 40,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        userId: ctx.userId,
        version: 1,
        createdAt: "",
        updatedAt: "",
      },
    ];

    // User scope match
    expect(configEngine.resolveConfiguration("tableCount", entries, ctx)).toBe(40);

    // Branch scope match when user is not present
    expect(
      configEngine.resolveConfiguration("tableCount", entries, {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
      })
    ).toBe(30);

    // Tenant scope match when branch is not present
    expect(
      configEngine.resolveConfiguration("tableCount", entries, { tenantId: ctx.tenantId })
    ).toBe(20);

    // Global fallback
    expect(configEngine.resolveConfiguration("tableCount", entries, {})).toBe(10);
  });

  it("executes dynamic plugin workflows across step lifecycle", () => {
    const wfEngine = new PluginWorkflowEngine();
    const wfDef = StandardPluginCatalog.find((p) => p.id === "restaurant")!.workflows[0];

    const instance = wfEngine.startWorkflow(wfDef, "order-123", ctx);
    expect(instance.currentStepNumber).toBe(1);
    expect(instance.status).toBe("IN_PROGRESS");

    // Advance step 1 -> 2
    wfEngine.advanceStep(instance, wfDef, ctx, "Chef started prep");
    expect(instance.currentStepNumber).toBe(2);

    // Advance step 2 -> 3
    wfEngine.advanceStep(instance, wfDef, ctx, "Food ready on pass");
    expect(instance.currentStepNumber).toBe(3);

    // Advance step 3 -> 4
    wfEngine.advanceStep(instance, wfDef, ctx, "Waitstaff served table");
    expect(instance.currentStepNumber).toBe(4);

    // Advance to complete
    wfEngine.advanceStep(instance, wfDef, ctx, "Finished");
    expect(instance.status).toBe("COMPLETED");
  });

  it("composes dynamic navigation items respecting role permissions", () => {
    const navEngine = new PluginNavigationEngine();
    const restaurantManifest = StandardPluginCatalog.find((p) => p.id === "restaurant")!;

    // User has "restaurant.tables.view" permission
    const navItems = navEngine.composeNavigation([restaurantManifest], ctx);
    expect(navItems.some((n) => n.path === "/plugins/restaurant/tables")).toBe(true);
    // User does not have "restaurant.kitchen.manage"
    expect(navItems.some((n) => n.path === "/plugins/restaurant/kds")).toBe(false);
  });

  it("aggregates dashboard KPI widgets accurately", () => {
    const dashEngine = new PluginDashboardEngine();
    const restaurantManifest = StandardPluginCatalog.find((p) => p.id === "restaurant")!;
    const dashboardDef = restaurantManifest.dashboards[0];

    const results = dashEngine.aggregateDashboardMetrics(dashboardDef, {
      todayCovers: 145,
      occupancyRate: 78,
    });
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.widgetId === "w-covers")?.value).toBe(145);
    expect(results.find((r) => r.widgetId === "w-occ")?.value).toBe(78);
  });
});
