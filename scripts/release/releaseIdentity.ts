import { execSync } from "child_process";
import {
  assertValidGitSha,
  assertValidContainerDigest,
  assertValidCloudRunRevision,
} from "@kwakopos2/domain";
import { loadConfig } from "@kwakopos2/config";

export interface AuthoritativeReleaseIdentity {
  version: string;
  gitSha: string;
  containerDigest: string;
  cloudRunRevision: string;
  releaseTimestamp: string;
}

/**
 * Resolves the real, un-tampered Git SHA from the checked-out commit.
 */
export function getRealGitSha(): string {
  try {
    const stdout = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    assertValidGitSha(stdout);
    return stdout;
  } catch (err: any) {
    throw new Error(`RELEASE_IDENTITY_FAILURE: Failed to resolve Git SHA: ${err.message}`);
  }
}

/**
 * Constructs authoritative release identity metadata from environment and git.
 */
export function getAuthoritativeReleaseIdentity(override?: {
  containerDigest?: string;
  cloudRunRevision?: string;
}): AuthoritativeReleaseIdentity {
  const config = loadConfig();
  const gitSha = getRealGitSha();

  // If environment specifies CONTAINER_DIGEST and CLOUD_RUN_REVISION, validate format strictly
  const containerDigest = override?.containerDigest || process.env.CONTAINER_DIGEST || config.CONTAINER_DIGEST;
  const cloudRunRevision = override?.cloudRunRevision || process.env.CLOUD_RUN_REVISION || config.CLOUD_RUN_REVISION;

  assertValidGitSha(gitSha);
  assertValidContainerDigest(containerDigest);
  assertValidCloudRunRevision(cloudRunRevision);

  return {
    version: config.APP_VERSION,
    gitSha,
    containerDigest,
    cloudRunRevision,
    releaseTimestamp: new Date().toISOString(),
  };
}
