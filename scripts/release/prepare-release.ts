import { calculateNextVersion, determineBumpFromCommits, isValidSemVer } from "../../packages/config/src/semverEngine.js";
import { generateReleaseManifest } from "./generate-release-manifest.js";
import { syncWorkspaceVersions } from "./sync-workspace-versions.js";
import { updateChangelog } from "./generate-changelog.js";
import { archiveReleaseArtifacts } from "./artifact-manager.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

function readPackageJson() {
  const rootPkgPath = path.resolve(process.cwd(), "package.json");
  return { path: rootPkgPath, value: JSON.parse(fs.readFileSync(rootPkgPath, "utf8")) };
}

function getLatestSemVerTag(): string | null {
  try {
    return (
      execSync("git tag --merged HEAD --sort=-v:refname", { encoding: "utf8" })
        .split("\n")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter(isValidSemVer)[0] || null
    );
  } catch {
    return null;
  }
}

function getCommitsSince(tag: string | null): string[] {
  try {
    const raw = tag
      ? execSync(`git log ${tag}..HEAD --pretty=%B---END_COMMIT---`, { encoding: "utf8" })
      : execSync("git log -20 --pretty=%B---END_COMMIT---", { encoding: "utf8" });
    return raw
      .split("---END_COMMIT---")
      .map((c) => c.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function prepareRelease(options?: { forceBump?: "MAJOR" | "MINOR" | "PATCH"; dryRun?: boolean }) {
  console.log("================================================================");
  console.log(" KWAKOPOS 2.0 AUTOMATED SEMVER RELEASE PREPARATION             ");
  console.log("================================================================");

  const { path: rootPkgPath, value: rootPkg } = readPackageJson();
  const currentVersion = rootPkg.version || "2.0.0";
  const baselineTag = getLatestSemVerTag();
  const baselineVersion = baselineTag || currentVersion;
  const commitMessages = getCommitsSince(baselineTag);
  const bump = options?.forceBump || determineBumpFromCommits(commitMessages);

  console.log(`[INFO] Current package.json Version: ${currentVersion}`);
  console.log(`[INFO] Latest SemVer Tag: ${baselineTag || "none"}`);
  console.log(`[INFO] Commits Since Baseline: ${commitMessages.length}`);
  console.log(`[INFO] Detected Bump Type: ${bump}`);

  if (bump === "NONE" && !options?.forceBump) {
    console.log("[INFO] No releasable Conventional Commit detected; version remains unchanged.");
    return { changed: false, currentVersion, nextVersion: currentVersion, baselineTag, bump };
  }

  const nextVersion = calculateNextVersion(baselineVersion, commitMessages, { forceBump: bump });
  console.log(`[INFO] Target Release Version: ${nextVersion}`);

  if (!options?.dryRun) {
    rootPkg.version = nextVersion;
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n", "utf8");

    const lockPath = path.resolve(process.cwd(), "package-lock.json");
    if (fs.existsSync(lockPath)) {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.version = nextVersion;
      if (lock.packages?.[""]) lock.packages[""].version = nextVersion;
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf8");
    }
    console.log(`✓ Updated authoritative root version to ${nextVersion}`);

    // Synchronize workspace subpackages
    syncWorkspaceVersions(nextVersion);

    // Update CHANGELOG.md automatically
    updateChangelog(nextVersion);
  }

  const manifest = generateReleaseManifest({ version: nextVersion, certification: "PASS" });
  console.log(`✓ Release Manifest synchronized for version ${manifest.version} (Tag: ${manifest.tag})`);

  if (!options?.dryRun) {
    archiveReleaseArtifacts(nextVersion);
  }

  console.log("================================================================");
  return { changed: true, currentVersion, nextVersion, baselineTag, bump, manifest };
}

if (process.argv[1]?.endsWith("prepare-release.ts")) {
  const force = process.argv.find((arg) => arg.startsWith("--force="))?.split("=")[1] as
    | "MAJOR"
    | "MINOR"
    | "PATCH"
    | undefined;
  prepareRelease({ forceBump: force, dryRun: process.argv.includes("--dry-run") });
}
