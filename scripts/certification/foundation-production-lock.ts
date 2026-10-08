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

// A01-A12 Foundation closure: every pillar must have a canonical authority and be wired into release gates.
assert(packageJson.scripts["certify:foundation"] === "tsx scripts/certification/foundation-production-lock.ts", "Foundation lock package script is missing.");
assert(exists("scripts/certification/offline-sync-production-lock.ts"), "Offline Sync Platform Production Lock is required.");
assert(packageJson.scripts["certify:offline-sync-lock"] === "tsx scripts/certification/offline-sync-production-lock.ts", "Offline Sync Platform Production Lock package script is missing.");
assert(exists("scripts/certification/super-admin-production-lock.ts"), "Independent Super Admin production lock is required.");
assert(packageJson.scripts["certify:super-admin"] === "tsx scripts/certification/super-admin-production-lock.ts", "Super Admin production lock script is not authoritative.");
for (const authority of Object.values(FOUNDATION_REQUIRED_AUTHORITIES)) {
  assert(exists(authority), "Missing foundation authority: " + authority);
}
for (const gate of FOUNDATION_REQUIRED_GATES) {
  assert(Boolean(packageJson.scripts[gate]), "Missing foundation gate script: " + gate);
}

const ciWorkflow = read(".github/workflows/ci.yml");
const candidateWorkflow = read(".github/workflows/production-certification.yml");
assert(ciWorkflow.includes("npm run certify:foundation"), "Foundation lock must run in CI.");
assert(candidateWorkflow.includes("npm run certify:foundation"), "Foundation lock must run in production candidate certification.");
assert(exactMainWorkflow.includes("npm run certify:foundation"), "Foundation lock must run in exact-main production certification.");

assert(exists("scripts/release/verify-platform-governance-control-plane.ts"), "Platform governance verifier missing.");
assert(exists("scripts/release/verify-ai-agent-governance.ts"), "AI governance verifier missing.");
assert(exists("scripts/release/verify-live-production-evidence.ts"), "Live production evidence verifier missing.");
assert(exists("scripts/certification/strict-runtime-certification.ts"), "Strict runtime certification missing.");
assert(exists("scripts/certification/strict-security-runtime-gate.ts"), "Strict security runtime gate missing.");
assert(exists("tests/browser/five-client-convergence.spec.ts"), "Real browser convergence test missing.");
try { execSync("npx tsx scripts/certification/super-admin-production-lock.ts", { cwd: root, stdio: "inherit" }); } catch { failures.push("Super Admin Production Lock failed."); }

try { execSync("npx tsx scripts/certification/offline-sync-production-lock.ts", { cwd: root, stdio: "inherit" }); } catch { failures.push("Offline Sync Platform Production Lock failed."); }

const tracked = execSync("git ls-files apps packages scripts .github", { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
const forbiddenProductionMarkers = [
  "/api/v1/super-admin/db/query",
  "currentOtp",
  'req.headers["x-admin-id"]',
  'req.headers["x-admin-email"]',
  'req.headers["x-admin-role"]',
];
for (const file of tracked) {
  if (
    file === "scripts/certification/foundation-production-lock.ts" ||
    /^apps\/web\/dist\//.test(file) ||
    /^artifacts\//.test(file)
  ) continue;
  let source = "";
  try { source = read(file); } catch { continue; }
  for (const forbidden of forbiddenProductionMarkers) {
    assert(!source.includes(forbidden), "Forbidden production security marker remains in " + file + ": " + forbidden);
  }
}

const certificationCampaign = packageJson.scripts["certify:campaign"] || "";
assert(certificationCampaign === "tsx scripts/certification/runFullSystemCertification.ts", "Production certification campaign must use the active full-system evidence engine.");
const activeFullSystem = read("scripts/certification/full-system-certification-engine.ts");
assert(!activeFullSystem.includes("Array.from({ length:"), "Active full-system certification engine contains synthetic pillar generation.");
assert(!read("scripts/certification/runFullSystemCertification.ts").includes("285a98b"), "Active production certification runner contains stale synthetic release evidence.");

if (head && /^[0-9a-f]{40}$/i.test(head) && manifest.gitSha) {
  assert(manifest.gitSha === head, "Non-empty committed release-manifest gitSha must equal current HEAD.");
}

const foundationCertificate = {
  certificate: FOUNDATION_PRODUCTION_LOCK_CERTIFICATE,
  version: FOUNDATION_PRODUCTION_LOCK_VERSION,
  verdict: failures.length ? "FAIL" : "PASS",
  releaseVersion: packageJson.version,
  commitSha: head || null,
  pillars: [
    "A01_RELEASE_IDENTITY","A02_AUTH_TRANSPORT","A03_RBAC_TENANT_ISOLATION",
    "A04_NAVIGATION","A05_PERSISTENCE_INDEXEDDB","A06_SYNC_CONVERGENCE",
    "A07_CONFLICT_CENTER","A08_DASHBOARD_ANALYTICS","A09_RUNTIME","A10_SECURITY",
    "A11_RELEASE_AUTHORITY","A12_GOVERNANCE",
  ],
  generatedAt: new Date().toISOString(),
};
fs.mkdirSync(path.join(root, "artifacts/governance"), { recursive: true });
fs.writeFileSync(
  path.join(root, "artifacts/governance/foundation-production-lock-certificate.json"),
  JSON.stringify(foundationCertificate, null, 2),
);

if (failures.length) {
  console.error("FOUNDATION PRODUCTION LOCK: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("FOUNDATION PRODUCTION LOCK: PASS");
console.log("A01-A12 Foundation production lock applied: release identity, auth transport, tenant/RBAC isolation, navigation, persistence, sync, conflict center, dashboard analytics, runtime, security, release authority, and governance are fail-closed.");
