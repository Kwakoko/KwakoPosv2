import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runSuperAdminPlatformCertification } from "../../scripts/certification/super-admin-platform-certification-engine.js";

describe("Super Admin Production Lock", () => {
  it("passes the repository-backed Super Admin control-plane certification", () => {
    const result = runSuperAdminPlatformCertification();
    expect(result.failedPillars).toBe(0);
    expect(result.successRatePct).toBe(100);
  });

  it("contains an independent fail-closed lock contract", () => {
    execFileSync("npx", ["tsx", "scripts/certification/super-admin-production-lock.ts"], { stdio: "pipe" });
  });
  it("protects the platform Super Admin role from tenant RBAC and provisioning permission escalation", async () => {
    const fs = await import("node:fs");
    const onboarding = fs.readFileSync("apps/api/src/routes/tenantOnboardingRoutes.ts", "utf8");
    const rbac = fs.readFileSync("apps/api/src/services/rbacMutationService.ts", "utf8");
    expect(onboarding).toContain('roles.includes("PLATFORM_SUPER_ADMIN")');
    expect(onboarding).not.toContain('permissions.includes("SUPER_ADMIN_OPERATIONS")');
    expect(rbac).toContain('"PLATFORM_SUPER_ADMIN"');
  });

});
