import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { calculateNextVersion, determineBumpFromCommits, isValidSemVer, ReleaseBumpType } from "@kwakopos2/config";

export interface VersionCalculationResult {
  currentVersion: string;
  nextVersion: string;
  bumpType: ReleaseBumpType;
  commitsEvaluatedCount: number;
  commitMessages: string[];
  isVersionChanged: boolean;
  baselineTag: string;
}

export function calculateAndSyncNextVersion(): VersionCalculationResult {
  console.log("[SEMVER_CALCULATOR] Determining next semantic version from Conventional Commits...");

  const rootPkgPath = path.resolve(process.cwd(), "package.json");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  const currentVersion = rootPkg.version;
  if (!currentVersion) throw new Error("SEMVER_BLOCKED: package.json version is missing.");

  let baselineTag = "";
  let commitMessages: string[] = [];

  try {
    baselineTag = execSync("git tag --merged HEAD --sort=-v:refname", { encoding: "utf8" })
      .split("\n")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter(isValidSemVer)[0] || "";
  } catch {
    baselineTag = "";
  }

  try {
    const range = baselineTag ? `${baselineTag}..HEAD` : "HEAD~20..HEAD";
    const rawLog = execSync(`git log ${range} --pretty=format:"%s"`, { encoding: "utf8" });
    commitMessages = rawLog.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
  } catch {
    commitMessages = [];
  }

  const bumpType = determineBumpFromCommits(commitMessages);
  const nextVersion = calculateNextVersion(baselineTag ? baselineTag.replace(/^v/, "") : currentVersion, commitMessages);
  const isVersionChanged = nextVersion !== currentVersion;

  console.log(`[SEMVER_CALCULATOR] Current Version: ${currentVersion}`);
  console.log(`[SEMVER_CALCULATOR] Baseline Tag:    ${baselineTag || "None (Initial)"}`);
  console.log(`[SEMVER_CALCULATOR] Commits Count:  ${commitMessages.length}`);
  console.log(`[SEMVER_CALCULATOR] Next Version:    ${nextVersion}`);

  if (isVersionChanged) {
    console.log(`[SEMVER_CALCULATOR] Version bump detected (${currentVersion} -> ${nextVersion}). Synchronizing monorepo package versions...`);
    execSync(`npx tsx scripts/release/sync-workspace-versions.ts ${nextVersion}`, { stdio: "inherit" });
  } else {
    console.log(`[SEMVER_CALCULATOR] Version ${currentVersion} is already up to date.`);
  }

  const result: VersionCalculationResult = {
    currentVersion,
    nextVersion,
    bumpType: isVersionChanged ? bumpType : "NONE",
    commitsEvaluatedCount: commitMessages.length,
    commitMessages,
    isVersionChanged,
    baselineTag,
  };

  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "kwakopos-semver-calculation.json"), JSON.stringify(result, null, 2), "utf8");

  return result;
}

if (process.argv[1]?.endsWith("semver-calculator.ts")) {
  calculateAndSyncNextVersion();
}
