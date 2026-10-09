import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { compareSemVer, isValidSemVer } from "../../packages/config/src/semverEngine.js";

export type PendingUnreleasedCandidateState = {
  packageVersion: string;
  manifestVersion: string;
  manifestTag: string;
  certification: string;
  latestStableVersion: string;
  candidateTagExists: boolean;
};

export function isPendingUnreleasedCandidate(state: PendingUnreleasedCandidateState): boolean {
  const version = state.packageVersion;
  const latest = state.latestStableVersion;
  return isValidSemVer(version) &&
    isValidSemVer(latest) &&
    state.manifestVersion === version &&
    state.manifestTag === `v${version}` &&
    state.certification === "PENDING" &&
    !state.candidateTagExists &&
    compareSemVer(version, latest) > 0;
}

function readPendingCandidateState(root = process.cwd()): PendingUnreleasedCandidateState {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "release-manifest.json"), "utf8"));
  const tags = execFileSync("git", ["tag", "--merged", "HEAD", "--sort=-v:refname"], {
    cwd: root,
    encoding: "utf8",
  }).split(/\r?\n/).map((tag) => tag.trim()).filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  const latestTag = tags[0];
  if (!latestTag) throw new Error("RELEASE_BLOCKED: no authoritative stable SemVer tag is available");

  const version = String(packageJson.version || "");
  const candidateTag = execFileSync("git", ["tag", "--list", `v${version}`], {
    cwd: root,
    encoding: "utf8",
  }).trim();

  return {
    packageVersion: version,
    manifestVersion: String(manifest.version || ""),
    manifestTag: String(manifest.tag || ""),
    certification: String(manifest.certification || ""),
    latestStableVersion: latestTag.slice(1),
    candidateTagExists: candidateTag.length > 0,
  };
}

if (process.argv[1]?.endsWith("pending-unreleased-candidate.ts")) {
  try {
    console.log(isPendingUnreleasedCandidate(readPendingCandidateState())
      ? "PENDING_UNRELEASED_CANDIDATE"
      : "NOT_PENDING_UNRELEASED_CANDIDATE");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "RELEASE_BLOCKED: pending candidate evaluation failed");
    process.exitCode = 2;
  }
}
