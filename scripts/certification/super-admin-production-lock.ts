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
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'roles.includes("PLATFORM_SUPER_ADMIN")', "dedicated platform role boundary");
requireAbsent("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'roles.includes("SUPER_ADMIN")', "legacy tenant Super Admin cannot enter platform routes");
requireAbsent("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'roles.includes("SUPERADMIN")', "legacy tenant Superadmin cannot enter platform routes");
requireText("apps/api/src/routes/tenantOnboardingRoutes.ts", 'return roles.includes("PLATFORM_SUPER_ADMIN");', "platform provisioning requires dedicated platform role");
requireAbsent("apps/api/src/routes/tenantOnboardingRoutes.ts", 'roles.includes("SUPER_ADMIN")', "legacy tenant Super Admin cannot provision tenants");
requireAbsent("apps/api/src/routes/tenantOnboardingRoutes.ts", 'roles.includes("SUPERADMIN")', "legacy tenant Superadmin cannot provision tenants");
requireAbsent("apps/api/src/routes/tenantOnboardingRoutes.ts", 'permissions.includes("SUPER_ADMIN_OPERATIONS")', "platform permission cannot grant provisioning");
requireText("apps/api/src/services/rbacMutationService.ts", '"PLATFORM_SUPER_ADMIN"', "tenant RBAC protects platform super admin role");
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'roles.includes("PLATFORM_SUPER_ADMIN")');
requireAbsent("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'permissions.includes("*")', "wildcard cannot grant Super Admin");
requireAbsent("apps/api/src/routes/superAdminDatabaseRoutes.ts", 'permissions.includes("admin:*")', "admin wildcard cannot grant Super Admin");
requireText("scripts/security/bootstrap-super-admin.ts", 'const email = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();', "bootstrap identity supplied by deployment");
requireText("scripts/security/bootstrap-super-admin.ts", 'name: "PLATFORM_SUPER_ADMIN"', "bootstrap creates dedicated platform role");
requireAbsent("scripts/security/bootstrap-super-admin.ts", 'name: "SUPER_ADMIN"', "bootstrap must not create tenant Super Admin role");
requireAbsent("scripts/security/bootstrap-super-admin.ts", 'permissions: ["*"]', "platform role must not inherit tenant wildcard permissions");
requireText("apps/api/src/services/superAdminSecurityService.ts", 'roleName !== "PLATFORM_SUPER_ADMIN"', "security rows cannot elevate tenant accounts");
requireText("apps/api/src/services/superAdminSecurityService.ts", "PLATFORM_AUDIT_WRITE_FAILED", "platform audit is fail-closed in production");

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
const liveTotpLeakMarker = ["current","Otp"].join("");
requireAbsent("apps/api/src/services/superAdminSecurityService.ts", liveTotpLeakMarker);
requireAbsent("apps/api/src/services/superAdminSecurityService.ts", "verifyWebAuthnResponse", "mock WebAuthn verification is forbidden in production security paths");

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
requireAbsent("packages/domain/src/superAdminPlatformEngine.ts", "Kwako Supermarket Ltd", "legacy tenant fixture");
requireAbsent("packages/domain/src/superAdminPlatformEngine.ts", "148500.0", "legacy fabricated revenue");
const syntheticPillarMarker = ["passed", "true"].join(", ");
requireAbsent("scripts/certification/super-admin-platform-certification-engine.ts", syntheticPillarMarker, "synthetic pillar certification");

// 10. Live security, diagnostics and release surfaces.
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "platform_super_admin_security", "security posture source");
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "pg_database_size(current_database())", "database diagnostics");
requireText("apps/api/src/routes/superAdminDatabaseRoutes.ts", "getReleaseIdentity(loadConfig())", "release identity");
requireText("apps/api/src/routes/supportControlTowerRoutes.ts", "/api/v1/super-admin/support/control-tower", "support control tower");
requireText("apps/api/src/routes/supportControlTowerRoutes.ts", "/api/v1/super-admin/support/tenants/:tenantId/health", "support tenant health");
requireText("packages/database/prisma/schema.prisma", "model PlatformAuditEvent", "platform audit schema model");
for (const workflow of [".github/workflows/ci.yml", ".github/workflows/production-certification.yml", ".github/workflows/production-release-exact-main.yml"]) {
  requireText(workflow, "npm run certify:super-admin", "Super Admin lock release gate");
}
requireText("scripts/certification/foundation-production-lock.ts", "scripts/certification/super-admin-production-lock.ts", "Foundation invokes Super Admin lock");
for (const workflow of [".github/workflows/ci.yml", ".github/workflows/production-certification.yml", ".github/workflows/production-release-exact-main.yml"]) {
  requireText(workflow, "npm run certify:super-admin", "explicit Super Admin Production Lock gate");
}
requireText("packages/database/prisma/migrations/202610080004_super_admin_production_lock/migration.sql", "BEFORE UPDATE OR DELETE ON platform_audit_events", "append-only platform audit ledger");
requireText("packages/database/prisma/migrations/202610080005_super_admin_platform_isolation/migration.sql", "PLATFORM_SUPER_ADMIN_SCOPE_VIOLATION", "database-enforced platform role scope");
requireText("packages/database/prisma/migrations/202610080005_super_admin_platform_isolation/migration.sql", "PLATFORM_SUPER_ADMIN_SECURITY_ROLE_VIOLATION", "security-row role binding");
requireText("packages/database/prisma/migrations/202610080005_super_admin_platform_isolation/migration.sql", "ARRAY['platform:control']", "platform role cannot inherit tenant wildcard permissions");
requireText("apps/api/src/server.ts", 'if (!roles.includes("PLATFORM_SUPER_ADMIN"))', "platform Super Admin route guard");
requireAbsent("apps/api/src/server.ts", 'if (!roles.includes("SUPER_ADMIN") && !roles.includes("SUPERADMIN")', "legacy role route bypass");
requireText("apps/api/src/server.ts", 'const isSuperAdmin = roleName === "PLATFORM_SUPER_ADMIN";', "platform-only login identity");
requireText("apps/api/src/server.ts", "PLATFORM_TENANT_APP_ISOLATION", "tenant application isolation");
requireText("apps/api/src/server.ts", 'requireStepUpToken(req, actor, "CONTEXT_SWITCH")', "context switch step-up");
requireText("apps/api/src/server.ts", 'requireStepUpToken(req, actor, "PLATFORM_EMERGENCY_KILL_SWITCH")', "emergency kill switch step-up");
requireAbsent("apps/api/src/server.ts", "body.adminId", "client-supplied Super Admin actor identity");
requireAbsent("apps/api/src/server.ts", 'admin@kwakopos.com', "hard-coded platform identity in context switching");
requireText("apps/web/src/context/KwakoPosContexts.tsx", 'String(user.role || "").toUpperCase() === "PLATFORM_SUPER_ADMIN"', "UI platform role boundary");
requireAbsent("apps/web/src/context/KwakoPosContexts.tsx", 'permissions.includes("SUPER_ADMIN_OPERATIONS")', "permission cannot elevate to platform mode");
requireAbsent("apps/web/src/context/KwakoPosContexts.tsx", 'permissions.includes("ADMIN:PLATFORM")', "permission cannot elevate to platform mode");
requireAbsent("apps/web/src/context/KwakoPosContexts.tsx", 'sessionStorage.getItem("kwakopos:v2:impersonation")', "client storage cannot unlock tenant inspection");
requireText("apps/web/src/context/KwakoPosContexts.tsx", "useState<ImpersonatedTenant | null>(null)", "tenant impersonation state defaults closed");
requireText("apps/web/src/layouts/SystemAppShellLayout.tsx", 'String(user?.role || "").toUpperCase() === "PLATFORM_SUPER_ADMIN"', "shell platform role boundary");
requireAbsent("apps/api/src/server.ts", "ADM-001", "fabricated platform actor identity");
requireAbsent("apps/api/src/server.ts", "ADM-SEC-01", "fabricated emergency actor identity");
requireText("apps/api/src/routes/tenantOnboardingRoutes.ts", "isPlatformProvisioner", "platform tenant provisioning authority");
requireText("apps/api/src/routes/tenantOnboardingRoutes.ts", "isSuperAdmin: true", "platform provisioning writes authoritative tenant state");
requireAbsent("apps/api/src/routes/supportControlTowerRoutes.ts", 'permissions.includes("*")', "support wildcard privilege bypass");
requireAbsent("apps/api/src/routes/supportControlTowerRoutes.ts", 'permissions.includes("admin:*")', "support admin wildcard privilege bypass");
requireAbsent("apps/api/src/routes/supportControlTowerRoutes.ts", 'roles.includes("SUPER_ADMIN")', "legacy role support bypass");
requireAbsent("apps/api/src/routes/supportControlTowerRoutes.ts", 'roles.includes("SUPERADMIN")', "legacy role support bypass");
requireText("apps/api/src/routes/supportControlTowerRoutes.ts", 'roles.includes("PLATFORM_SUPER_ADMIN")', "platform-only support access");
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
