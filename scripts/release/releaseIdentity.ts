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

export function getRealGitSha(): string {
  try {
    const stdout = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    assertValidGitSha(stdout);
    return stdout;
  } catch (err: any) {
    if (process.env.NODE_ENV === "production-certification") {
      console.error("RELEASE_BLOCKED: Unable to obtain real 40-char Git SHA from repository checkout.");
      process.exit(1);
    }
    throw new Error(`RELEASE_IDENTITY_FAILURE: Failed to resolve Git SHA: ${err.message}`);
  }
}

export function getAuthoritativeReleaseIdentity(override?: {
  containerDigest?: string;
  cloudRunRevision?: string;
}): AuthoritativeReleaseIdentity {
  const isProdCert = process.env.NODE_ENV === "production-certification";
  const gitSha = getRealGitSha();
  const config = loadConfig();

  const containerDigest = override?.containerDigest || process.env.CONTAINER_DIGEST || config.CONTAINER_DIGEST;
  const cloudRunRevision = override?.cloudRunRevision || process.env.CLOUD_RUN_REVISION || config.CLOUD_RUN_REVISION;

  if (isProdCert) {
    if (containerDigest && containerDigest.includes("efd6bc4300000000000000000000000000000000000000000000000000000000")) {
      console.error("RELEASE_BLOCKED: Default synthetic container digest detected in production-certification mode.");
      process.exit(1);
    }
    if (cloudRunRevision && cloudRunRevision === "kwakopos-production-rev-00001") {
      console.error("RELEASE_BLOCKED: Default synthetic Cloud Run revision detected in production-certification mode.");
      process.exit(1);
    }
  }

  assertValidGitSha(gitSha);
  if (containerDigest) assertValidContainerDigest(containerDigest);
  if (cloudRunRevision) assertValidCloudRunRevision(cloudRunRevision);

  return {
    version: config.APP_VERSION,
    gitSha,
    containerDigest: containerDigest || "",
    cloudRunRevision: cloudRunRevision || "",
    releaseTimestamp: new Date().toISOString(),
  };
}
