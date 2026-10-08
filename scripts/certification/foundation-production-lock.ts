import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  FOUNDATION_PRODUCTION_LOCK_VERSION,
  FOUNDATION_PRODUCTION_LOCK_CERTIFICATE,
  FOUNDATION_REQUIRED_AUTHORITIES,
  FOUNDATION_REQUIRED_GATES,
} from "../../packages/config/src/foundationProductionLock.js";

const root = process.cwd();
const failures: string[] = [];
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const json = (p: string) => JSON.parse(read(p));
const assert = (ok: boolean, msg: string) => { if (!ok) failures.push(msg); };
const exists = (p: string) => fs.existsSync(path.join(root, p));

const packageJson = json("package.json");
const manifest = json("release-manifest.json");
const config = read("packages/config/src/index.ts");
const authoritative = read("packages/config/src/authoritativeRelease.ts");
const compatibility = read("apps/web/src/persistence/releaseCompatibility.ts");
const indexedDb = read("apps/web/src/indexedDb.ts");
const migration = read("apps/web/src/persistence/migrationEngine.ts");
const server = read("apps/api/src/server.ts");
const onboarding = read("apps/api/src/services/tenantOnboardingService.ts");
const legal = read("apps/api/src/services/legalGovernanceService.ts");
const legalRoutes = read("apps/api/src/routes/legalGovernanceRoutes.ts");
const rollbackRoutes = read("apps/api/src/routes/rollbackAuthorizationRoutes.ts");
const cleanupRoutes = read("apps/api/src/routes/productionCleanlinessRoutes.ts");
const financeHardener = read("scripts/ci/harden-production-finance.ts");
const stepGuard = read("apps/api/src/services/stepUpGuard.ts");
const auditMigration = read("packages/database/prisma/migrations/202609280001_audit_events_append_only/migration.sql");
const exactMainWorkflow = read(".github/workflows/production-release-exact-main.yml");

let head = String(process.env.GITHUB_SHA || "").trim();
if (!head) {
  try { head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(); } catch {}
}

assert(packageJson.version === "2.13.0", "Foundation lock targets release line 2.13.0.");
assert(manifest.version === packageJson.version && manifest.tag === "v" + packageJson.version, "Committed release manifest version/tag drift.");
assert(manifest.certification !== "FAIL", "Committed release manifest may not advertise FAIL.");
assert(manifest.releaseChannel === "development" && manifest.environment === "development", "Committed source manifest must be non-production metadata.");
assert(manifest.compatibility.databaseSchemaVersion === 4, "Database schema authority must be 4.");
assert(manifest.compatibility.syncProtocolVersion === 2, "Sync protocol authority must be 2.");
assert(manifest.compatibility.pwaSchemaVersion === 7, "PWA schema authority must be 7.");
assert(indexedDb.includes("AUTHORITATIVE_SCHEMA_VERSION = 7"), "IndexedDB schema authority must be 7.");
assert(compatibility.includes("schemaVersion: 7") && compatibility.includes('databaseCompatibilityRange: ">=1 <=7"'), "Web release compatibility must target PWA schema 7.");
assert(compatibility.includes("6->7"), "Web migration compatibility must include 6->7.");
assert(migration.includes("if (toVersion >= 6 && fromVersion < 6)"), "IndexedDB V5->V6 migration must remain present.");
assert(migration.includes("if (toVersion >= 7 && fromVersion < 7)"), "IndexedDB V6->V7 migration must remain present.");
assert(authoritative.includes("pwaSchemaVersion: 7"), "Config authoritative PWA schema must be 7.");
assert(config.includes("pwaSchemaVersion: 7"), "Runtime compatibility PWA schema must be 7.");
assert(!config.includes('return "0000000000000000000000000000000000000000";'), "All-zero production Git SHA fallback is forbidden.");
assert(!config.includes("K_REVISION).digest"), "Cloud Run revision must never be converted into a fake Git SHA.");
assert(onboarding.includes("class TenantOnboardingService") && !onboarding.includes("forceAcceptanceForTest("), "Tenant onboarding must never invoke a test legal bypass.");
assert(legal.includes('process.env.NODE_ENV !== "test"'), "Legal test bypass must fail outside NODE_ENV=test.");
assert(legalRoutes.includes('if (process.env.NODE_ENV !== "test")'), "Legal mock endpoints must be test-only.");
assert(!server.includes('req.headers["x-admin-id"]') && !server.includes('req.headers["x-admin-email"]') && !server.includes('req.headers["x-admin-role"]'), "Super Admin identity must not come from client headers.");
assert(server.includes("requireSuperAdminContext(req)") && server.includes("allowedStepUpActions"), "Super Admin control-plane identity and step-up allowlist are required.");
assert(stepGuard.includes("verifyStepUpToken") && stepGuard.includes("STEP_UP_IDENTITY_MISMATCH"), "Step-up guard must verify and bind operator identity.");
assert(rollbackRoutes.includes('requireStepUpToken(req, ctx, "ROLLBACK_EXECUTE")') && rollbackRoutes.includes('requireStepUpToken(req, ctx, "ROLLBACK_EMERGENCY")'), "Rollback destructive routes must consume step-up authentication.");
assert(cleanupRoutes.includes('"TENANT_PURGE"') && cleanupRoutes.includes('"PRODUCTION_CLEANUP"') && cleanupRoutes.includes("requireStepUpToken"), "Cleanup destructive routes must consume step-up authentication.");
assert(!financeHardener.includes("writeFileSync") && !financeHardener.includes(".replace("), "Finance hardener must be assertion-only, never mutate source.");
assert(auditMigration.includes('BEFORE UPDATE OR DELETE ON "audit_events"'), "AuditEvents must remain PostgreSQL append-only.");
assert(exactMainWorkflow.includes("actions/checkout@v4") && exactMainWorkflow.includes("fetch-depth: 0"), "Exact-main release workflow must checkout full history.");
assert(exactMainWorkflow.includes("GITHUB_SHA") || exactMainWorkflow.includes("github.sha"), "Exact-main release workflow must bind artifacts to immutable GitHub SHA.");

if (head && /^[0-9a-f]{40}$/i.test(head) && manifest.gitSha) {
  assert(manifest.gitSha === head, "Non-empty committed release-manifest gitSha must equal current HEAD.");
}

if (failures.length) {
  console.error("FOUNDATION PRODUCTION LOCK: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("FOUNDATION PRODUCTION LOCK: PASS");
console.log("Release identity, schema convergence, legal bypass isolation, server-authoritative admin identity, destructive step-up enforcement, finance assertion-only hardening, and audit append-only persistence are locked.");
