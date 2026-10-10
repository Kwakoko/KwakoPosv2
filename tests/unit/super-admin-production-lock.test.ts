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
    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/certification/super-admin-production-lock.ts"], { stdio: "pipe" });
  });
  it("protects the platform Super Admin role from tenant RBAC and provisioning permission escalation", async () => {
    const fs = await import("node:fs");
    const onboarding = fs.readFileSync("apps/api/src/routes/tenantOnboardingRoutes.ts", "utf8");
    const rbac = fs.readFileSync("apps/api/src/services/rbacMutationService.ts", "utf8");
    const server = fs.readFileSync("apps/api/src/server.ts", "utf8");
    const superAdminRoutes = fs.readFileSync("apps/api/src/routes/superAdminDatabaseRoutes.ts", "utf8");
    const supportRoutes = fs.readFileSync("apps/api/src/routes/supportControlTowerRoutes.ts", "utf8");
    const bootstrap = fs.readFileSync("scripts/security/bootstrap-super-admin.ts", "utf8");
    const security = fs.readFileSync("apps/api/src/services/superAdminSecurityService.ts", "utf8");

    expect(onboarding).toContain('return roles.includes("PLATFORM_SUPER_ADMIN");');
    expect(onboarding).not.toContain('roles.includes("SUPER_ADMIN")');
    expect(onboarding).not.toContain('roles.includes("SUPERADMIN")');
    expect(rbac).toContain('"PLATFORM_SUPER_ADMIN"');

    expect(superAdminRoutes).toContain('roles.includes("PLATFORM_SUPER_ADMIN")');
    expect(superAdminRoutes).not.toContain('roles.includes("SUPER_ADMIN")');
    expect(superAdminRoutes).not.toContain('roles.includes("SUPERADMIN")');

    expect(supportRoutes).toContain('roles.includes("PLATFORM_SUPER_ADMIN")');
    expect(supportRoutes).not.toContain('roles.includes("SUPER_ADMIN")');
    expect(supportRoutes).not.toContain('roles.includes("SUPERADMIN")');

    expect(server).toContain('const isSuperAdmin = roleName === "PLATFORM_SUPER_ADMIN";');
    expect(server).toContain("PLATFORM_TENANT_APP_ISOLATION");
    expect(server).toContain('if (!roles.includes("PLATFORM_SUPER_ADMIN"))');
    expect(server).not.toContain('const isSuperAdmin = roleName === "SUPER_ADMIN" || roleName === "PLATFORM_SUPER_ADMIN"');

    expect(bootstrap).toContain('name: "PLATFORM_SUPER_ADMIN"');
    expect(bootstrap).toContain('create: { tenantId: tenant.id, name: "PLATFORM_SUPER_ADMIN"');
    expect(bootstrap).not.toContain('create: { tenantId: tenant.id, name: "SUPER_ADMIN"');
    expect(bootstrap).not.toContain('permissions: ["*"]');

    expect(security).toContain('roleName !== "PLATFORM_SUPER_ADMIN"');
    expect(security).toContain("PLATFORM_AUDIT_WRITE_FAILED");
  });

});
