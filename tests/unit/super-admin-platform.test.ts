import { describe, it, expect } from "vitest";
import { SuperAdminPlatformEngine } from "@kwakopos2/domain";
import { runSuperAdminPlatformCertification } from "../../scripts/certification/super-admin-platform-certification-engine.js";

describe("Phase 29 — KwakoPos Super Admin & Platform UI Test Suite", () => {
  const engine = new SuperAdminPlatformEngine();
  engine.registerTenant({
    tenantId: "TENANT-CERT",
    name: "Certification Tenant",
    status: "ACTIVE",
    country: "TZ",
    branchesCount: 1,
    modulesCount: 0,
    createdAt: "2026-10-08T00:00:00Z",
  });

  it("should verify plane isolation between Super Admin Control Plane and Tenant Operating Plane", () => {
    const plane = engine.getOperatingPlane("ADM-001", "admin@kwakopos.com", "PLATFORM_ADMIN");
    expect(plane.plane).toBe("PLATFORM_CONTROL_PLANE");
    expect(plane.adminIdentity.role).toBe("PLATFORM_ADMIN");
  });

  it("should initiate and exit time-limited audited tenant context switch sessions", () => {
    const session = engine.executeTenantContextSwitch("ADM-001", "TENANT-001", "Support ticket investigation", 20);
    expect(session.isActive).toBe(true);
    expect(session.tenantId).toBe("TENANT-001");
    expect(session.timeLimitMinutes).toBe(20);

    const exited = engine.exitTenantContextSwitch(session.switchId);
    expect(exited).toBe(true);
  });

  it("should execute platform emergency kill switches with immutable audit logging", () => {
    const ks = engine.triggerEmergencyKillSwitch("GLOBAL_AI", "Container security isolation", "ADM-SEC-01");
    expect(ks.target).toBe("GLOBAL_AI");
    expect(ks.immutableAuditId).toContain("AUDIT-KS-");

    const health = engine.getHealthSummary();
    expect(health.planeIsolationInvariantPassing).toBe(true);
  });

  it("should evaluate feature flag hierarchy (Global -> Country -> Tenant -> Branch)", () => {
    const flagRes = engine.evaluateFeatureFlag("beta-ui-v2", { global: true, country: true, tenant: false });
    expect(flagRes.effectiveValue).toBe(false);
    expect(flagRes.evaluationPath).toBe("Global -> Country -> Tenant");
  });

  it("should pass 100% of the repository-backed Super Admin certification campaign", () => {
    const cert = runSuperAdminPlatformCertification();
    expect(cert.totalPillars).toBe(15);
    expect(cert.passedPillars).toBe(70);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
