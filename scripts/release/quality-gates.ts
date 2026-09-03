import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { runDatabaseMigrationGate } from "./database-migration-gate.js";
import { verifyAllKwakoPosModules } from "./verify-kwakopos-modules.js";
import { generateAIReleaseSummary } from "./ai-release-notes-generator.js";

export interface QualityGateItem { name: string; passed: boolean; message: string; }
export interface QualityGateReport { overallPassed: boolean; version: string; timestamp: string; gates: QualityGateItem[]; }

function runCommand(command: string, timeout = 300000): { passed: boolean; output: string } {
  try {
    const output = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout });
    return { passed: true, output: output.trim() };
  } catch (error: any) {
    const output = `${error?.stdout || ""}${error?.stderr || ""}`.trim();
    return { passed: false, output: output || String(error?.message || error) };
  }
}

function record(gates: QualityGateItem[], name: string, result: { passed: boolean; message: string }) {
  gates.push({ name, passed: result.passed, message: result.message });
}

export async function runReleaseQualityGates(): Promise<QualityGateReport> {
  console.log("========================================================================");
  console.log(" KWAKOPOS 15-POINT ENTERPRISE RELEASE QUALITY GATES EVALUATOR");
  console.log("========================================================================");

  const pkgPath = path.resolve(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const version = String(pkg.version || "");
  if (!version) throw new Error("package.json version is required");
  const timestamp = new Date().toISOString();
  const gates: QualityGateItem[] = [];

  const build = runCommand("npm run build");
  record(gates, "Build Successful", {
    passed: build.passed,
    message: build.passed ? "Monorepo build completed successfully" : `Build failed: ${build.output.slice(-2000)}`,
  });

  const typecheck = runCommand("npx tsc --noEmit");
  record(gates, "Type Check Passed", {
    passed: typecheck.passed,
    message: typecheck.passed ? "Zero TypeScript errors" : `TypeScript check failed: ${typecheck.output.slice(-2000)}`,
  });

  const tests = runCommand("npm run test:unit");
  record(gates, "Tests Passed", {
    passed: tests.passed,
    message: tests.passed ? "Unit test suite passed" : `Unit tests failed: ${tests.output.slice(-2000)}`,
  });

  const audit = runCommand("npm audit --audit-level=high");
  record(gates, "Security / Dependency Audit Passed", {
    passed: audit.passed,
    message: audit.passed ? "npm audit reports no high/critical vulnerabilities" : `Dependency audit failed: ${audit.output.slice(-2000)}`,
  });

  const dbRes = runDatabaseMigrationGate({ dryRun: true });
  record(gates, "Database Migration Validated", {
    passed: dbRes.passed,
    message: dbRes.passed ? "Schema integrity verified" : `DB check failed: ${dbRes.error}`,
  });

  record(gates, "API Compatibility Verified", {
    passed: typecheck.passed && build.passed,
    message: typecheck.passed && build.passed ? "API packages compile cleanly against shared contracts" : "API compatibility blocked by build/typecheck failure",
  });

  const syncTests = runCommand("npm run test:sync");
  record(gates, "Offline Sync Validation Passed", {
    passed: syncTests.passed,
    message: syncTests.passed ? "Sync test suite passed" : `Sync tests failed: ${syncTests.output.slice(-2000)}`,
  });

  const webDist = path.resolve(process.cwd(), "apps/web/dist");
  const webBuild = fs.existsSync(webDist);
  record(gates, "PWA Build Successful", {
    passed: webBuild,
    message: webBuild ? "apps/web/dist exists after build" : "apps/web/dist is missing after build",
  });

  const serviceWorker = [
    path.resolve(process.cwd(), "apps/web/public/sw.js"),
    path.resolve(process.cwd(), "apps/web/dist/sw.js"),
  ].some((file) => fs.existsSync(file));
  record(gates, "Service Worker Validation Passed", {
    passed: serviceWorker,
    message: serviceWorker ? "Service worker source/build artifact exists" : "Service worker artifact not found",
  });

  const bundleBytes = fs.existsSync(webDist)
    ? fs.readdirSync(webDist, { recursive: true }).reduce((total, entry) => {
        const absolute = path.join(webDist, String(entry));
        try { return total + (fs.statSync(absolute).isFile() ? fs.statSync(absolute).size : 0); } catch { return total; }
      }, 0)
    : 0;
  const bundleOk = bundleBytes > 0 && bundleBytes <= 2.5 * 1024 * 1024;
  record(gates, "Bundle Size Within Limits", {
    passed: bundleOk,
    message: bundleOk ? `PWA bundle size ${(bundleBytes / 1024 / 1024).toFixed(2)} MB <= 2.5 MB` : `PWA bundle size ${(bundleBytes / 1024 / 1024).toFixed(2)} MB exceeds target or is empty`,
  });

  record(gates, "Performance Threshold Met", {
    passed: false,
    message: "No live performance sample was collected by the release script; production latency must be certified by the deployed runtime gate",
  });

  const summary = generateAIReleaseSummary(version);
  record(gates, "Release Notes Generated", {
    passed: Boolean(summary),
    message: summary ? "Release notes generated" : "Release notes generator returned no summary",
  });

  const tagCheck = runCommand(`git rev-parse --verify "refs/tags/v${version}"`);
  record(gates, "Git Tag Created", {
    passed: tagCheck.passed,
    message: tagCheck.passed ? `Tag v${version} exists` : `Tag v${version} does not exist`,
  });

  const backupDir = path.resolve(process.cwd(), `artifacts/releases/${version}`);
  const backupOk = fs.existsSync(backupDir) && fs.readdirSync(backupDir).length > 0;
  record(gates, "Backup / Release Evidence Completed", {
    passed: backupOk,
    message: backupOk ? `Release evidence exists at artifacts/releases/${version}` : `No release evidence found at artifacts/releases/${version}`,
  });

  const modRes = await verifyAllKwakoPosModules();
  record(gates, "Module Verification Passed", {
    passed: modRes.allPassed,
    message: modRes.allPassed ? "All registered KwakoPos modules verified" : "One or more KwakoPos modules failed verification",
  });

  const overallPassed = gates.every((gate) => gate.passed);
  console.log("\n--- QUALITY GATES SUMMARY ---");
  gates.forEach((gate, index) => console.log(` ${gate.passed ? "✓" : "✗"} [${String(index + 1).padStart(2, "0")}/15] ${gate.name.padEnd(36)} : ${gate.message}`));
  console.log(overallPassed ? "\n🎉 ALL QUALITY GATES PASSED" : "\n❌ QUALITY GATES FAILED — RELEASE BLOCKED");
  return { overallPassed, version, timestamp, gates };
}

if (process.argv[1]?.endsWith("quality-gates.ts")) {
  runReleaseQualityGates().then((report) => {
    if (!report.overallPassed) process.exit(1);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
