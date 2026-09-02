import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const target = process.env.KWAKOPOS_TENANT_ONBOARDING_BASE_URL || "";
const enabled = process.env.RUN_TENANT_ONBOARDING_E2E === "1";
const requiredFiles = [
  "packages/database/prisma/migrations/202609020001_tenant_onboarding/migration.sql",
  "packages/contracts/src/tenantOnboardingContracts.ts",
  "apps/api/src/services/tenantOnboardingService.ts",
  "apps/api/src/routes/tenantOnboardingRoutes.ts",
  "apps/web/src/pages/TenantOnboardingPage.tsx",
  "tests/integration/tenant-onboarding.test.ts",
  "tests/browser/tenant-onboarding.spec.ts",
];

const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length) {
  console.error(JSON.stringify({ status: "FAIL", reason: "MISSING_IMPLEMENTATION_FILES", missing }, null, 2));
  process.exit(1);
}

if (!enabled) {
  console.log(JSON.stringify({ status: "BLOCKED_EXTERNAL", reason: "Live tenant onboarding E2E is disabled; use an isolated staging deployment", target: target || null, requiredEnv: ["RUN_TENANT_ONBOARDING_E2E=1", "KWAKOPOS_TENANT_ONBOARDING_BASE_URL", "KWAKOPOS_TENANT_ONBOARDING_ADMIN_EMAIL", "KWAKOPOS_TENANT_ONBOARDING_ADMIN_PASSWORD"] }, null, 2));
  process.exit(0);
}

if (!target || /production/i.test(target)) {
  console.error(JSON.stringify({ status: "FAIL", reason: "SAFE_TARGET_REQUIRED", message: "Tenant onboarding certification requires a non-production staging target" }, null, 2));
  process.exit(1);
}

if (!process.env.KWAKOPOS_TENANT_ONBOARDING_ADMIN_EMAIL || !process.env.KWAKOPOS_TENANT_ONBOARDING_ADMIN_PASSWORD) {
  console.error(JSON.stringify({ status: "BLOCKED_EXTERNAL", reason: "MISSING_STAGING_CREDENTIALS" }, null, 2));
  process.exit(0);
}

try {
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "test", "tests/browser/tenant-onboarding.spec.ts"], { stdio: "inherit", env: process.env });
  console.log(JSON.stringify({ status: "PASS", target, test: "tenant-onboarding.browser" }, null, 2));
} catch {
  console.error(JSON.stringify({ status: "FAIL", target, test: "tenant-onboarding.browser" }, null, 2));
  process.exit(1);
}
