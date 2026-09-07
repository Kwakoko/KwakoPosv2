import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { runSecurityAcceptanceTestSuite } from "./security-auth-ux-acceptance-engine.js";

function read(file: string): string {
  return fs.readFileSync(path.resolve(file), "utf8");
}

function fail(message: string): never {
  throw new Error(`STRICT_SECURITY_GATE_FAILED: ${message}`);
}

function requirePass(condition: boolean, message: string): void {
  if (!condition) fail(message);
}

function exactSha(): string {
  return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
}

function scanProductionSource(root: string): string[] {
  const banned = [
    "DEMO_ACCOUNTS",
    "quickFill",
    "cashier123",
    "admin/admin",
    "password123",
    "owner@kwakopos.com",
  ];
  const violations: string[] = [];
  const allowedTestRoots = [
    `${path.sep}tests${path.sep}`,
    `${path.sep}fixtures${path.sep}`,
    `${path.sep}__tests__${path.sep}`,
  ];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|json|html|css)$/.test(entry.name)) continue;
      if (allowedTestRoots.some((token) => full.includes(token))) continue;
      const content = fs.readFileSync(full, "utf8");
      for (const token of banned) {
        if (content.includes(token)) violations.push(`${full}: ${token}`);
      }
    }
  };

  walk(path.resolve(root));
  return violations;
}

async function main(): Promise<void> {
  const sha = exactSha();
  const loginPage = read("apps/web/src/pages/LoginPage.tsx");
  const apiClient = read("apps/web/src/services/apiClient.ts");
  const fixedServer = read("apps/api/src/serverFixed.ts");
  const context = read("apps/web/src/context/KwakoPosContexts.tsx");
  const securityEngine = read("scripts/certification/security-auth-ux-acceptance-engine.ts");

  requirePass(!loginPage.includes("DEMO_ACCOUNTS"), "LoginPage contains DEMO_ACCOUNTS");
  requirePass(!loginPage.includes("quickFill"), "LoginPage contains demo quick-fill logic");
  requirePass(!loginPage.includes("POS PIN"), "LoginPage exposes unsupported PIN authentication");
  requirePass(!apiClient.includes("refreshToken?: unknown"), "apiClient contains legacy refresh-token migration typing");
  requirePass(!apiClient.includes("hasOwnProperty.call(parsed, \"refreshToken\")"), "apiClient contains legacy refresh-token migration logic");
  requirePass(!fixedServer.includes("data: { accessToken, refreshToken"), "Production login returns refreshToken in JSON");
  requirePass(!fixedServer.includes("data: { accessToken: rotated.accessToken, refreshToken"), "Production refresh returns refreshToken in JSON");
  requirePass(fixedServer.includes("HttpOnly") && fixedServer.includes("SameSite=Strict"), "Production refresh cookie is not hardened");
  requirePass(!context.includes("canAccessModule: () => true"), "Module context has permissive default access");
  requirePass(context.includes("createContext<ModuleContextType | null>(null)"), "Module context does not fail closed outside its provider");
  requirePass(!securityEngine.includes("check: () => true") && !securityEngine.includes("check:()=>true"), "Security engine contains unconditional pass checks");
  requirePass(!securityEngine.includes("passDetails"), "Security engine contains declarative pass-only evidence text");

  const violations = scanProductionSource("apps");
  requirePass(violations.length === 0, `Prohibited production-auth/demo tokens found: ${violations.join(" | ")}`);

  process.env.KWAKOPOS_SECURITY_TARGET_URL = process.env.KWAKOPOS_SECURITY_TARGET_URL || "http://127.0.0.1:3000";
  process.env.KWAKOPOS_SECURITY_TEST_EMAIL = process.env.KWAKOPOS_SECURITY_TEST_EMAIL || "security.tester@kwakopos.net";
  process.env.KWAKOPOS_SECURITY_TEST_PASSWORD = process.env.KWAKOPOS_SECURITY_TEST_PASSWORD || "KwakoSecure2026!#";
  const { ensureSecurityTestUser } = await import("./seed-security-user.js");
  await ensureSecurityTestUser();

  const report = await runSecurityAcceptanceTestSuite();
  requirePass(report.gitSha === sha, `Security suite SHA ${report.gitSha} does not match current SHA ${sha}`);
  const failedP0 = report.testResults.filter((t) => t.priority === "P0" && !t.passed);
  requirePass(report.summary.p0.failed === 0, `Security suite has ${report.summary.p0.failed} P0 failures: ${JSON.stringify(failedP0, null, 2)}`);
  requirePass(report.summary.p1.failed === 0, `Security suite has ${report.summary.p1.failed} P1 failures`);
  requirePass(report.summary.p2.failed === 0, `Security suite has ${report.summary.p2.failed} P2 failures`);

  const blocked = report.testResults.filter((result) => result.details.startsWith("BLOCKED_EXTERNAL"));
  requirePass(blocked.length === 0, `Security suite requires external live execution: ${blocked.map((r) => r.id).join(", ")}`);

  console.log(JSON.stringify({
    status: report.overallStatus,
    certified: report.certified,
    gitSha: report.gitSha,
    summary: report.summary,
    automaticFailures: report.automaticFailures,
  }, null, 2));

  if (!report.certified) fail("Executable security acceptance suite did not certify the current SHA");
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
