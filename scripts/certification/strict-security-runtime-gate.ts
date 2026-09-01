import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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
    "owner@kwakopos.com",
    "cashier123",
    "admin/admin",
    "password123",
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

function main(): void {
  const sha = exactSha();
  const loginPage = read("apps/web/src/pages/LoginPage.tsx");
  const apiClient = read("apps/web/src/services/apiClient.ts");
  const fixedServer = read("apps/api/src/serverFixed.ts");
  const packageJson = JSON.parse(read("package.json")) as { version?: string };
  const webPackage = JSON.parse(read("apps/web/package.json")) as { version?: string };
  const apiPackage = JSON.parse(read("apps/api/package.json")) as { version?: string };

  requirePass(!loginPage.includes("DEMO_ACCOUNTS"), "LoginPage contains DEMO_ACCOUNTS");
  requirePass(!loginPage.includes("quickFill"), "LoginPage contains demo quick-fill logic");
  requirePass(!loginPage.includes("POS PIN"), "LoginPage exposes unsupported PIN authentication");
  requirePass(!loginPage.includes("cashier123"), "LoginPage contains a demo password");
  requirePass(!apiClient.includes("sessionStorage") || !apiClient.includes("refreshToken:"), "apiClient appears to persist refresh-token material in browser storage");
  requirePass(!/data:\s*\{[^}]*refreshToken\s*:\s*session\.refreshToken/.test(fixedServer), "Production login returns refreshToken in JSON");
  requirePass(!/data:\s*\{[^}]*refreshToken\s*:\s*rotated\.refreshToken/.test(fixedServer), "Production refresh returns refreshToken in JSON");
  requirePass(!fixedServer.includes("KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL"), "Production runtime still contains a bootstrap authentication backdoor");
  requirePass(packageJson.version === webPackage.version && packageJson.version === apiPackage.version, "Root/web/api versions are inconsistent");

  const violations = scanProductionSource("apps");
  requirePass(violations.length === 0, `Prohibited production-auth/demo tokens found: ${violations.join(" | ")}`);

  const evidencePath = path.resolve("artifacts/release-evidence/security-ui-browser-evidence.json");
  requirePass(fs.existsSync(evidencePath), "Missing security UI browser evidence for exact Git SHA");
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8")) as {
    gitSha?: string;
    overallStatus?: string;
    p0Failures?: number;
    p1Failures?: number;
    p2Failures?: number;
  };
  requirePass(evidence.gitSha === sha, `Security browser evidence SHA ${evidence.gitSha ?? "<missing>"} does not match ${sha}`);
  requirePass(evidence.overallStatus === "PASS" || evidence.overallStatus === "PASS_WITH_P3_HARDENING", "Security browser evidence is not PASS");
  requirePass((evidence.p0Failures ?? 1) === 0, "Security browser evidence reports P0 failures");
  requirePass((evidence.p1Failures ?? 1) === 0, "Security browser evidence reports P1 failures");
  requirePass((evidence.p2Failures ?? 1) === 0, "Security browser evidence reports P2 failures");

  console.log(JSON.stringify({ status: "PASS", gitSha: sha, checked: ["demo-auth", "pin-auth", "refresh-token-storage", "bootstrap-backdoor", "release-version", "browser-evidence"] }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(String(error));
  process.exit(1);
}
