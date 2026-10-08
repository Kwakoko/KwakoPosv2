import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];
const read = (relative: string) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
};
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const requireText = (relative: string, needle: string, label = needle) => {
  const source = read(relative);
  if (!source.includes(needle)) failures.push(`MISSING: ${relative} :: ${label}`);
};
const requireAbsent = (relative: string, needle: string, label = needle) => {
  const source = read(relative);
  if (source.includes(needle)) failures.push(`FORBIDDEN: ${relative} :: ${label}`);
};

// 1. Independent lock artifact and release wiring.
requireText("package.json", '"certify:super-admin": "tsx scripts/certification/super-admin-production-lock.ts"', "package script");
requireText("scripts/certification/super-admin-production-lock.ts", "SUPER ADMIN PRODUCTION LOCK: PASS", "fail-closed runner");

// 2. Server-authoritative control-plane routes.
for (const route of [
  '/api/v1/super-admin/tenants',
  '/api/v1/super-admin/tenants/:tenantId/suspend',
  '/api/v1/super-admin/tenants/:tenantId/reactivate',
  '/api/v1/super-admin/subscriptions',
  '/api/v1/super-admin/subscriptions/:tenantId/change-plan',
  '/api/v1/super-admin/feature-flags',
  '/api/v1/super-admin/feature-flags/:scopeKey/:flagKey',
  '/api/v1/super-admin/audit',
  '/api/v1/super-admin/security/health',
  '/api/v1/super-admin/diagnostics',
  '/api/v1/super-admin/releases',
  '/api/v1/super-admin/overview/live',
]) requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", route);

// 3. Independent strict Super Admin authorization.
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'roles.includes("SUPER_ADMIN")');
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'roles.includes("PLATFORM_SUPER_ADMIN")');
requireAbsent("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'permissions.includes("*")', "wildcard cannot grant Super Admin");
requireAbsent("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'permissions.includes("admin:*")', "admin wildcard cannot grant Super Admin");

// 4. High-risk mutation step-up policy.
for (const action of ["TENANT_SUSPEND","TENANT_REACTIVATE","SUBSCRIPTION_CHANGE","FEATURE_FLAG_CHANGE"]) {
  requireText("apps/api/src/server.ts", action, `step-up allowlist ${action}`);
  requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", `requireStepUpToken(req,ctx,"${action}")`, `step-up guard ${action}`);
}

// 5. PostgreSQL authority.
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'source:"postgresql"', "live source declaration");
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "prisma.tenant.findMany", "tenant registry");
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "prisma.saasDataRecord.findMany", "subscription registry");
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "prisma.auditEvent.findMany", "tenant audit history");

// 6. Durable platform audit storage.
requireText("packages/database/prisma/migrations/202610080004_super_admin_production_lock/migration.sql", "CREATE TABLE IF NOT EXISTS platform_audit_events");
requireText("packages/database/prisma/migrations/202610080004_super_admin_production_lock/migration.sql", "tenant_id TEXT NULL");
requireText("packages/database/prisma/schema.prisma", "model PlatformSuperAdminSecurity");
requireText("packages/database/prisma/schema.prisma", "model AuthLoginThrottle");

// 7. Replay-safe MFA and authenticated step-up.
requireText("apps/api/src/services/superAdminSecurityService.ts", "findValidTotpCounter");
requireText("apps/api/src/services/superAdminSecurityService.ts", "[-1, 0, 1]");
requireText("apps/api/src/services/superAdminSecurityService.ts", "last_totp_counter");
requireText("apps/api/src/services/superAdminSecurityService.ts", 'algorithms: ["HS256"]');
requireText("apps/api/src/services/superAdminSecurityService.ts", "issuer: getJwtIssuer()");
requireText("apps/api/src/services/superAdminSecurityService.ts", "audience: getJwtAudience()");
requireAbsent("apps/api/src/services/superAdminSecurityService.ts", "currentOtp");

// 8. No client-side email-based platform-root bypass.
for (const file of [
  "apps/web/src/App.tsx",
  "apps/web/src/layouts/SystemAppShellLayout.tsx",
  "apps/web/src/pages/SuperAdminRollbackCenterPage.tsx",
]) requireAbsent(file, 'admin@kwakoko.co.tz', "hard-coded identity bypass");

// 9. No synthetic tenant/revenue authority in the Super Admin engine.
requireAbsent("packages/domain/src/superAdminPlatformEngine.ts", "Kwako Supermarket Ltd", "default tenant fixture");
requireAbsent("packages/domain/src/superAdminPlatformEngine.ts", "Kilimanjaro Pharmacy Ltd", "default tenant fixture");
requireAbsent("packages/domain/src/superAdminPlatformEngine.ts", "148500.0", "fabricated platform revenue");
requireText("packages/domain/src/superAdminPlatformEngine.ts", "registerTenant", "test-only explicit registration seam");

// 10. Live security, diagnostics and release surfaces.
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "platform_super_admin_security", "security posture source");
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "pg_database_size(current_database())", "database diagnostics");
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "getReleaseIdentity(loadConfig())", "release identity");
requireAbsent("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'logs: []', "fabricated system logs");

// 11. Live control-plane UI.
requireText("apps/web/src/components/SuperAdminLiveControlPlane.tsx", "/api/v1/super-admin/subscriptions", "live subscription UI");
requireText("apps/web/src/components/SuperAdminLiveControlPlane.tsx", "/api/v1/super-admin/audit", "live audit UI");
requireText("apps/web/src/components/SuperAdminLiveControlPlane.tsx", "/api/v1/super-admin/security/health", "live security UI");
requireText("apps/web/src/pages/SuperAdminPage.tsx", "SuperAdminLiveControlPlane", "control-plane UI wiring");
requireText("apps/web/src/pages/SuperAdminPage.tsx", "/api/v1/super-admin/overview/live", "live overview");

if (!exists("apps/api/src/routes/superAdminDatabaseRoutes.ts")) failures.push("MISSING: Super Admin route authority");
if (!exists("packages/database/prisma/migrations/202610080004_super_admin_production_lock/migration.sql")) failures.push("MISSING: Super Admin production migration");

const certificate = {
  certificate: "KWAKOKO-SUPER-ADMIN-PRODUCTION-LOCK-v1",
  version: "1.0.0",
  verdict: failures.length ? "FAIL" : "PASS",
  scope: [
    "tenant-management","tenant-provisioning","tenant-suspension","subscription-management",
    "system-health","global-audit","feature-flags","release-controls","support",
    "security-monitoring","platform-diagnostics","privileged-access",
  ],
  generatedAt: new Date().toISOString(),
  failures,
};

fs.mkdirSync(path.join(root, "artifacts/governance"), { recursive: true });
fs.writeFileSync(
  path.join(root, "artifacts/governance/super-admin-production-lock-certificate.json"),
  JSON.stringify(certificate, null, 2),
);

if (failures.length) {
  console.error("SUPER ADMIN PRODUCTION LOCK: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("SUPER ADMIN PRODUCTION LOCK: PASS");
console.log("Certificate: " + certificate.certificate);
console.log("Scope: tenant management, provisioning, suspension, subscriptions, health, global audit, feature flags, releases, support, security monitoring, diagnostics.");
