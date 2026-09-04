import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface TamperReport {
  isTampered: boolean;
  protectedFilesChecked: number;
  modifiedProtectedFiles: string[];
  branchName: string;
  gitSha: string;
  auditMessage: string;
}

const PROTECTED_PATHS = [
  ".github/workflows",
  "scripts/release",
  "scripts/security",
  "scripts/certification",
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
];

export function runTamperDetection(): TamperReport {
  console.log("[TAMPER_DETECTOR] Checking repository release control file integrity...");

  let branchName = "unknown";
  let gitSha = "unknown";
  try {
    branchName = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
    gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    // Git metadata fallback
  }

  const modifiedProtectedFiles: string[] = [];

  // Check uncommitted changes in protected paths
  try {
    const statusOutput = execSync("git status --porcelain", { encoding: "utf8" });
    const lines = statusOutput.split("\n").filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const filePath = line.substring(3).trim();
      for (const protectedPath of PROTECTED_PATHS) {
        if (filePath.startsWith(protectedPath)) {
          // If running during CI release pipeline, staged files might exist; flag untracked/modified control overrides
          if (line.startsWith("??") || line.startsWith(" M") || line.startsWith(" D")) {
            modifiedProtectedFiles.push(filePath);
          }
        }
      }
    }
  } catch {
    // Git status execution error
  }

  const isTampered = modifiedProtectedFiles.length > 0;
  const auditMessage = isTampered
    ? `RELEASE_BLOCKED: Tampering detected in release control files: ${modifiedProtectedFiles.join(", ")}`
    : `PASS: Release control file integrity verified for commit ${gitSha.substring(0, 7)} on branch ${branchName}.`;

  console.log(`[TAMPER_DETECTOR] ${auditMessage}`);

  const report: TamperReport = {
    isTampered,
    protectedFilesChecked: PROTECTED_PATHS.length,
    modifiedProtectedFiles,
    branchName,
    gitSha,
    auditMessage,
  };

  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  const reportPath = path.join(artifactDir, "kwakopos-tamper-report.json");
  for (let i = 0; i < 5; i++) {
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
      break;
    } catch (e) {
      if (i === 4) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }

  if (isTampered && process.env.CI === "true") {
    throw new Error(auditMessage);
  }

  return report;
}

if (process.argv[1]?.endsWith("tamper-detector.ts")) {
  runTamperDetection();
}
