import { describe, it, expect } from "vitest";
import { DynamicModuleUiEngine } from "@kwakopos2/domain";
import { runDynamicModuleUiCertification } from "../../scripts/certification/dynamic-module-ui-certification-engine.js";

describe("Phase 28 — KwakoPos Dynamic Module UI (DMUI) Test Suite", () => {
  const engine = new DynamicModuleUiEngine();

  it("should register dynamic module UI manifests and compose navigation entries", () => {
    const regRes = engine.registerDynamicModule({
      moduleId: "mod-test-fleet",
      displayName: "Fleet Plugin",
      version: "1.0.0",
      navigation: [{ id: "nav-fl-veh", label: "Vehicles", path: "/fleet/vehicles", icon: "truck", permissions: ["fleet.read"] }],
      routes: [{ path: "/fleet/vehicles", componentName: "FleetVehiclesView", requiredPermissions: ["fleet.read"] }],
      supportedPlatformVersion: "^2.0.0",
    });
    expect(regRes.success).toBe(true);

    const navs = engine.composeNavigation(["fleet.read"]);
    expect(navs.some((n) => n.moduleId === "mod-test-fleet")).toBe(true);
  });

  it("should handle module activation and deactivation dynamically", () => {
    engine.setModuleStatus("mod-restaurant", "DISABLED", "Tenant disabled restaurant");
    const disabledNav = engine.composeNavigation(["restaurant.tables"]);
    expect(disabledNav.some((n) => n.moduleId === "mod-restaurant")).toBe(false);

    engine.setModuleStatus("mod-restaurant", "ACTIVE");
    const activeNav = engine.composeNavigation(["restaurant.tables"]);
    expect(activeNav.some((n) => n.moduleId === "mod-restaurant")).toBe(true);
  });

  it("should isolate dynamic module failure while preserving Core UI operational state", () => {
    const failureRes = engine.isolateModuleFailure("mod-pharmacy", "Component render crash");
    expect(failureRes.isolated).toBe(true);
    expect(failureRes.coreUiPreserved).toBe(true);

    const health = engine.getHealthSummary();
    expect(health.coreIsolationInvariantPassing).toBe(true);
  });

  it("should pass 100% of the 74-Pillar Dynamic Module UI certification campaign", () => {
    const cert = runDynamicModuleUiCertification();
    expect(cert.totalPillars).toBe(74);
    expect(cert.passedPillars).toBe(74);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
