import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPlatformOnlyPath, isPlatformSuperAdminRole, shouldUsePlatformShell } from "../../apps/web/src/utils/platformRole.js";

describe("Super Admin shell selection and role routing", () => {
  it("recognizes only the dedicated platform role as platform Super Admin", () => {
    expect(isPlatformSuperAdminRole("PLATFORM_SUPER_ADMIN")).toBe(true);
    expect(isPlatformSuperAdminRole("platform_super_admin")).toBe(true);
    expect(isPlatformSuperAdminRole("SUPER_ADMIN")).toBe(false);
    expect(isPlatformSuperAdminRole("SUPERADMIN")).toBe(false);
    expect(isPlatformSuperAdminRole("ADMIN")).toBe(false);
    expect(isPlatformSuperAdminRole(null)).toBe(false);
    expect(isPlatformSuperAdminRole(undefined)).toBe(false);
    expect(shouldUsePlatformShell("PLATFORM_SUPER_ADMIN", false)).toBe(true);
    expect(shouldUsePlatformShell("PLATFORM_SUPER_ADMIN", true)).toBe(false);
    expect(shouldUsePlatformShell("SUPER_ADMIN", false)).toBe(false);
  });

  it("classifies platform-only destinations separately from tenant workspace paths", () => {
    expect(isPlatformOnlyPath("/super-admin")).toBe(true);
    expect(isPlatformOnlyPath("/super-admin/")).toBe(true);
    expect(isPlatformOnlyPath("/super-admin/unknown-child")).toBe(true);
    expect(isPlatformOnlyPath("/super-admin/rollback")).toBe(true);
    expect(isPlatformOnlyPath("/diagnostics")).toBe(true);
    expect(isPlatformOnlyPath("/tenant-onboarding")).toBe(true);
    expect(isPlatformOnlyPath("/dashboard")).toBe(false);
    expect(isPlatformOnlyPath("/administration")).toBe(false);
    expect(isPlatformOnlyPath("/inventory")).toBe(false);
  });

  it("uses the canonical role predicate for login redirects, history routing, and shell chrome", () => {
    const app = readFileSync("apps/web/src/App.tsx", "utf8");
    const shell = readFileSync("apps/web/src/layouts/SystemAppShellLayout.tsx", "utf8");

    expect(app).toContain('import { isPlatformOnlyPath, isPlatformSuperAdminRole, shouldUsePlatformShell } from "./utils/platformRole.js";');
    expect(app).toContain('import { SuperAdminShellLayout } from "./layouts/SuperAdminShellLayout.js";');
    expect(app).toContain("const platformContextLocked = shouldUsePlatformShell(user?.role, Boolean(impersonatedTenant));");
    expect(app).toContain("isSuperAdmin && impersonatedTenant && isPlatformOnlyPath(currentPath)");
    expect(app).toContain("void stopImpersonation().catch");
    expect(app).toContain("Restoring the platform control context");
    expect(app).toContain('<SuperAdminShellLayout currentPath={currentPath} onNavigate={handleNavigate}>');
    expect(app).toContain('else if (isPlatformSuperAdminRole(user?.role))');
    const shellSelection = app.slice(app.lastIndexOf("if (platformContextLocked) {"));
    expect(shellSelection).toContain("<SuperAdminShellLayout");
    expect(shellSelection.indexOf("<SuperAdminShellLayout")).toBeLessThan(shellSelection.indexOf("<SystemAppShellLayout"));
    expect(app).toContain('setActiveTab(isPlatformSuperAdminRole(user?.role) && !impersonatedTenant');
    expect(app).not.toContain('["SUPER_ADMIN","SUPERADMIN","PLATFORM_SUPER_ADMIN"].includes');

    expect(shell).toContain('import { isPlatformSuperAdminRole } from "../utils/platformRole.js";');
    expect(shell).toContain('Boolean(isSuperAdmin || isPlatformSuperAdminRole(user?.role))');
    expect(shell).not.toContain('["SUPER_ADMIN","SUPERADMIN","PLATFORM_SUPER_ADMIN"].includes');
  });
});
