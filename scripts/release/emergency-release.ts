import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { runTamperDetection } from "./tamper-detector.js";
import { runReleaseQualityGates } from "./quality-gates.js";
import { publishGitHubRelease } from "./publish-github-release.js";


export interface EmergencyReleaseRequest {
  authorizer: string;
  incidentId: string;
  reason: string;
  targetVersion?: string;
}

export interface EmergencyReleaseResult {
  success: boolean;
  version: string;
  gitSha: string;
  auditRecord: any;
  timestamp: string;
}

export async function executeEmergencyRelease(req: EmergencyReleaseRequest): Promise<EmergencyReleaseResult> {
  console.log("========================================================================");
  console.log(" ⚠️  KWAKOPOS EMERGENCY PRODUCTION RELEASE INITIATION                   ");
  console.log("========================================================================");

  if (!req.authorizer || !req.incidentId || !req.reason) {
    throw new Error("EMERGENCY_RELEASE_BLOCKED: Mandatory fields missing (authorizer, incidentId, reason).");
  }

  const gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

  console.log(`[EMERGENCY] Authorizer:  ${req.authorizer}`);
  console.log(`[EMERGENCY] Incident ID: ${req.incidentId}`);
  console.log(`[EMERGENCY] Reason:      ${req.reason}`);
  console.log(`[EMERGENCY] Target SHA:  ${gitSha}`);

  // Mandatory Security & Tamper Verification
  runTamperDetection();

  // Mandatory Pre-Release Quality Gates
  const gates = await runReleaseQualityGates();
  if (!gates.overallPassed) {
    throw new Error("EMERGENCY_RELEASE_BLOCKED: Security & Integrity quality gates failed.");
  }

  // Version bump / tag
  const rootPkgPath = path.resolve(process.cwd(), "package.json");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  const version = req.targetVersion || rootPkg.version || "2.5.0";

  const auditRecord = {
    releaseType: "EMERGENCY_PRODUCTION_HOTFIX",
    authorizer: req.authorizer,
    incidentId: req.incidentId,
    reason: req.reason,
    version,
    gitSha,
    qualityGatesPassed: true,
    timestamp: new Date().toISOString(),
  };

  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, `emergency-release-${req.incidentId}.json`), JSON.stringify(auditRecord, null, 2), "utf8");

  await publishGitHubRelease();

  console.log("========================================================================");
  console.log(` 🎉 EMERGENCY RELEASE PUBLISHED & CERTIFIED: v${version}`);
  console.log("========================================================================");

  return {
    success: true,
    version,
    gitSha,
    auditRecord,
    timestamp: new Date().toISOString(),
  };
}

if (process.argv[1]?.endsWith("emergency-release.ts")) {
  const req: EmergencyReleaseRequest = {
    authorizer: process.env.EMERGENCY_AUTHORIZER || "SECURITY_ADMIN",
    incidentId: process.env.INCIDENT_ID || `INC-${Date.now()}`,
    reason: process.env.EMERGENCY_REASON || "Critical security vulnerability hotfix",
  };
  executeEmergencyRelease(req).catch((err) => {
    console.error("Emergency release failed:", err);
    process.exit(1);
  });
}
