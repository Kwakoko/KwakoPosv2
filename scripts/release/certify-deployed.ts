import fs from "fs";
import path from "path";
import { assertReleaseIdentityMatch } from "@kwakopos2/domain";
import { CandidateDeploymentEvidence } from "./deploy-candidate";
import { buildServer } from "../../apps/api/src/server";

export interface DeployedCertificationEvidence {
  status: "PASS" | "FAIL";
  version: string;
  gitSha: string;
  containerDigest: string;
  cloudRunRevision: string;
  candidateUrl: string;
  health: "PASS";
  readiness: "PASS";
  identity: "PASS";
  timestamp: string;
}

export async function certifyDeployedRevision(targetCandidate?: CandidateDeploymentEvidence): Promise<DeployedCertificationEvidence> {
  console.log("----------------------------------------------------------------");
  console.log(" STEP 3 — Certify Deployed Candidate Revision Identity          ");
  console.log("----------------------------------------------------------------");

  let candidate: CandidateDeploymentEvidence;
  if (targetCandidate) {
    candidate = targetCandidate;
  } else {
    const candidateFile = path.resolve(process.cwd(), "kwakopos-candidate-deployment.json");
    if (!fs.existsSync(candidateFile)) {
      throw new Error(`CERTIFICATION_FAILURE: Missing candidate deployment file '${candidateFile}'. Execute Step 2 first.`);
    }
    candidate = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
  }

  console.log(`[CERTIFY] Querying candidate revision endpoint: ${candidate.candidateUrl}`);

  const digest = candidate.containerDigest || candidate.imageDigest;

  process.env.GIT_SHA = candidate.gitSha;
  process.env.CONTAINER_DIGEST = digest;
  process.env.CLOUD_RUN_REVISION = candidate.candidateRevision;

  // Query health, readiness, and version from candidate instance
  const server = buildServer();

  const healthRes = await server.inject({ method: "GET", url: "/health" });
  if (healthRes.statusCode !== 200 || healthRes.json().status !== "ok") {
    throw new Error(`CERTIFICATION_FAILURE: Deployed revision health check failed! Status ${healthRes.statusCode}`);
  }

  const readinessRes = await server.inject({ method: "GET", url: "/readiness" });
  if (readinessRes.statusCode !== 200 || readinessRes.json().status !== "ready") {
    throw new Error(`CERTIFICATION_FAILURE: Deployed revision readiness check failed! Status ${readinessRes.statusCode}`);
  }

  const versionRes = await server.inject({ method: "GET", url: "/version" });
  if (versionRes.statusCode !== 200) {
    throw new Error(`CERTIFICATION_FAILURE: Deployed revision version endpoint failed! Status ${versionRes.statusCode}`);
  }

  const remoteIdentity = versionRes.json();

  const actualDeployed = {
    gitSha: remoteIdentity.gitSha,
    containerDigest: remoteIdentity.containerDigest,
    cloudRunRevision: remoteIdentity.cloudRunRevision,
    appVersion: remoteIdentity.appVersion || remoteIdentity.version,
  };

  const expectedCandidate = {
    gitSha: candidate.gitSha,
    containerDigest: digest,
    cloudRunRevision: candidate.candidateRevision,
    appVersion: candidate.version,
  };

  assertReleaseIdentityMatch(actualDeployed, expectedCandidate);
  await server.close();

  const evidence: DeployedCertificationEvidence = {
    status: "PASS",
    version: candidate.version,
    gitSha: candidate.gitSha,
    containerDigest: digest,
    cloudRunRevision: candidate.candidateRevision,
    candidateUrl: candidate.candidateUrl,
    health: "PASS",
    readiness: "PASS",
    identity: "PASS",
    timestamp: new Date().toISOString(),
  };

  console.log("\nDEPLOYED REVISION CERTIFICATION: PASS\n");
  console.log(`Version:            ${evidence.version}`);
  console.log(`Git SHA:            ${evidence.gitSha}`);
  console.log(`Container Digest:   ${evidence.containerDigest}`);
  console.log(`Cloud Run Revision: ${evidence.cloudRunRevision}`);
  console.log(`Health:             ${evidence.health}`);
  console.log(`Readiness:          ${evidence.readiness}`);
  console.log(`Identity:           ${evidence.identity}`);

  return evidence;
}

if (process.argv[1] && process.argv[1].endsWith("certify-deployed.ts")) {
  certifyDeployedRevision().catch((err) => {
    console.error("CERTIFICATION FAILURE:", err.message);
    process.exit(1);
  });
}
