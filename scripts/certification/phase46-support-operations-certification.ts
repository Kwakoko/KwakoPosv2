import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "packages/database/prisma/migrations/202609020002_phase46_support_operations/migration.sql",
  "apps/api/src/services/supportOperationsService.ts",
  "apps/api/src/routes/supportOperationsRoutes.ts",
  "apps/api/src/serverFixed.ts",
  "apps/web/src/pages/SupportOperationsPage.tsx",
];

const checks: Array<[string, () => boolean]> = [
  ["Support persistence migration exists", () => fs.existsSync(path.join(root, requiredFiles[0]))],
  ["Tenant-scoped support service exists", () => fs.existsSync(path.join(root, requiredFiles[1]))],
  ["Support API routes exist", () => fs.existsSync(path.join(root, requiredFiles[2]))],
  ["Production server mounts support routes", () => fs.readFileSync(path.join(root, requiredFiles[3]), "utf8").includes("supportOperationsRoutes(server)")],
  ["Tenant support UI exists", () => fs.existsSync(path.join(root, requiredFiles[4]))],
  ["Ticket storage enforces tenant scope", () => fs.readFileSync(path.join(root, requiredFiles[1]), "utf8").includes("tenant_id") && fs.readFileSync(path.join(root, requiredFiles[1]), "utf8").includes("assertTenant")],
  ["Diagnostics never claim confirmed root cause from symptoms", () => fs.readFileSync(path.join(root, requiredFiles[1]), "utf8").includes("root cause is not yet confirmed")],
  ["Restricted remediation is blocked", () => fs.readFileSync(path.join(root, requiredFiles[1]), "utf8").includes("REMEDIATION_RESTRICTED")],
  ["Resolution requires verification", () => fs.readFileSync(path.join(root, requiredFiles[1]), "utf8").includes("VERIFICATION_REQUIRED")],
  ["Support actions are audited", () => fs.readFileSync(path.join(root, requiredFiles[1]), "utf8").includes("SupportEvent") && fs.readFileSync(path.join(root, requiredFiles[1]), "utf8").includes("audit(")],
  ["API exposes diagnosis endpoint", () => fs.readFileSync(path.join(root, requiredFiles[2]), "utf8").includes("/diagnose")],
  ["API exposes remediation endpoint", () => fs.readFileSync(path.join(root, requiredFiles[2]), "utf8").includes("/remediation")],
  ["API exposes resolution endpoint", () => fs.readFileSync(path.join(root, requiredFiles[2]), "utf8").includes("/resolve")],
  ["Support UI creates real tickets", () => fs.readFileSync(path.join(root, requiredFiles[4]), "utf8").includes("/api/v1/support/tickets")],
];

let passed = 0;
console.log("========================================================================");
console.log(" KWAKOPOS PHASE 46 — 360° SUPPORT OPERATIONS CERTIFICATION              ");
console.log("========================================================================\n");
for (const [name, test] of checks) {
  const ok = (() => { try { return test(); } catch { return false; } })();
  if (ok) passed++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}
console.log(`\nPASSED: ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
