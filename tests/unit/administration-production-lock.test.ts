import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Administration production lock", () => {
  it("exposes one authoritative Administration control plane", () => {
    const page = read("apps/web/src/pages/AdministrationPage.tsx");
    const routes = read("apps/api/src/routes/administrationRoutes.ts");
    const server = read("apps/api/src/server.ts");
    const lock = read("scripts/certification/administration-production-lock.ts");
    const packageJson = read("package.json");
    const superAdmin = read("apps/web/src/pages/SuperAdminPage.tsx");

    for (const label of [
      "Tenant", "Branches", "Users", "Roles & Permissions", "Subscription", "Billing",
      "Feature Modules", "System Configuration", "Security Configuration", "Audit Logs",
    ]) {
      expect(page).toContain(label);
    }

    expect(page).toContain("/api/v1/branches");
    expect(page).toContain("/api/v1/users");
    expect(page).toContain("/api/v1/roles");
    expect(page).toContain("/api/v1/billing/subscriptions/current");
    expect(page).toContain("/api/v1/billing/invoices");
    expect(page).toContain("/api/v1/administration/modules");
    expect(page).toContain("/api/v1/administration/settings/batch");
    expect(page).toContain("/api/v1/administration/audit");

    expect(routes).toContain("FEATURE_MODULE_ENTITLEMENTS_UPDATED");
    expect(routes).toContain("globalSettingsService.upsertBatch");
    expect(routes).toContain("prisma.auditEvent.findMany");
    expect(server).toContain('import { administrationRoutes } from "./routes/administrationRoutes.js";');
    expect(server).toContain("administrationRoutes(server, { rbacService: rbacMutationService });");
    expect(lock).toContain("ADMINISTRATION-PRODUCTION-LOCK-2026-10-08");
    expect(packageJson).toContain("\"certify:administration-lock\": \"tsx scripts/certification/administration-production-lock.ts\"");
    expect(superAdmin).not.toContain("Awaiting live billing telemetry");
    expect(superAdmin).not.toContain("This control surface remains connected to the live platform telemetry engine.");
  });

  it("keeps tenant administration fail-closed", () => {
    const routes = read("apps/api/src/routes/tenantOnboardingRoutes.ts");
    expect(routes).toContain("canAdministerTenant");
    expect(routes).toContain("Tenant administration permission is required");
    expect(routes).toContain('permissions.includes("settings.manage")');
  });

  it("does not retain placeholder MRR or Administration fallback messaging", () => {
    const admin = read("apps/web/src/pages/AdministrationPage.tsx");
    expect(admin).not.toContain("Awaiting live billing telemetry");
    expect(admin).not.toContain("This control surface remains connected to the live platform telemetry engine.");
  });

  it("registers the Administration route in the SPA router", () => {
    const app = read("apps/web/src/App.tsx");
    const shell = read("apps/web/src/layouts/SystemAppShellLayout.tsx");
    expect(app).toContain('"/administration": "Administration"');
    expect(app).toContain('case "/administration":');
    expect(shell).toContain('onNavigate("/administration")');
    expect(shell).toContain('permissions.includes("ADMIN:PLATFORM")');
  });
});
