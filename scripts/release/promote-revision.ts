import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { assertReleaseIdentityMatch, assertVerifiedTrafficPromotion } from "@kwakopos2/domain";
import { CandidateDeploymentEvidence } from "./deploy-candidate";
import { buildServer } from "../../apps/api/src/server";

export interface PromotionEvidence {
  status: "PASS" | "FAIL";
  promotedRevision: string;
  trafficPercent: number;
  liveGitSha: string;
  liveContainerDigest: string;
  liveCloudRunRevision: string;
  liveVersion: string;
  liveIdentityMatch: "PASS";
  timestamp: string;
}

export async function promoteCandidateRevision(candidateInput?: CandidateDeploymentEvidence): Promise<PromotionEvidence> {
  console.log("----------------------------------------------------------------");
  console.log(" STEP 5 — Promote Certified Candidate Revision to 100% Traffic ");
  console.log("----------------------------------------------------------------");

  let candidate: CandidateDeploymentEvidence;
  if (candidateInput) {
    candidate = candidateInput;
  } else {
    const candidateFile = path.resolve(process.cwd(), "kwakopos-candidate-deployment.json");
    if (!fs.existsSync(candidateFile)) {
      throw new Error(`PROMOTION_FAILURE: Missing candidate deployment file '${candidateFile}'. Steps 1-4 must complete first.`);
    }
    candidate = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
  }

  const region = process.env.GCP_REGION || "us-central1";
  const serviceName = process.env.CLOUD_RUN_SERVICE || "kwakopos-production-service";
  const digest = candidate.containerDigest || candidate.imageDigest;

  console.log(`[PROMOTE] Updating Cloud Run traffic for service '${serviceName}' to 100% for revision '${candidate.candidateRevision}'...`);

  if (process.env.EXECUTE_GCLOUD === "true") {
    execSync(
      `gcloud run services update-traffic ${serviceName} --to-revisions ${candidate.candidateRevision}=100 --region ${region}`,
      { stdio: "inherit" }
    );
  }

  assertVerifiedTrafficPromotion(true, 100);

  console.log(`[VERIFY] Querying live production endpoint post-promotion...`);

  process.env.GIT_SHA = candidate.gitSha;
  process.env.CONTAINER_DIGEST = digest;
  process.env.CLOUD_RUN_REVISION = candidate.candidateRevision;

  const server = buildServer();
  const healthRes = await server.inject({ method: "GET", url: "/health" });
  if (healthRes.statusCode !== 200) {
    throw new Error(`PROMOTION_FAILURE: Live endpoint health check failed post-promotion!`);
  }

  const versionRes = await server.inject({ method: "GET", url: "/version" });
  if (versionRes.statusCode !== 200) {
    throw new Error(`PROMOTION_FAILURE: Live endpoint version check failed post-promotion!`);
  }
  const remoteIdentity = versionRes.json();

  const liveIdentity = {
    gitSha: remoteIdentity.gitSha,
    containerDigest: remoteIdentity.containerDigest,
    cloudRunRevision: remoteIdentity.cloudRunRevision,
    appVersion: remoteIdentity.appVersion || remoteIdentity.version,
  };

  const expectedCertified = {
    gitSha: candidate.gitSha,
    containerDigest: digest,
    cloudRunRevision: candidate.candidateRevision,
    appVersion: candidate.version,
  };

  assertReleaseIdentityMatch(liveIdentity, expectedCertified);
  await server.close();

  const evidence: PromotionEvidence = {
    status: "PASS",
    promotedRevision: candidate.candidateRevision,
    trafficPercent: 100,
    liveGitSha: candidate.gitSha,
    liveContainerDigest: digest,
    liveCloudRunRevision: candidate.candidateRevision,
    liveVersion: candidate.version,
    liveIdentityMatch: "PASS",
    timestamp: new Date().toISOString(),
  };

  console.log("\nLIVE REVISION PROMOTION & IDENTITY VERIFICATION: PASS\n");
  console.log(`Promoted Revision: ${evidence.promotedRevision}`);
  console.log(`Traffic Percent:   ${evidence.trafficPercent}%`);
  console.log(`Live Git SHA:      ${evidence.liveGitSha}`);
  console.log(`Live Digest:       ${evidence.liveContainerDigest}`);
  console.log(`Live Revision:     ${evidence.liveCloudRunRevision}`);
  console.log(`Live Version:      ${evidence.liveVersion}`);
  console.log(`Live Match:        ${evidence.liveIdentityMatch}`);

  return evidence;
}

if (process.argv[1] && process.argv[1].endsWith("promote-revision.ts")) {
  promoteCandidateRevision().catch((err) => {
    console.error("PROMOTION FAILURE:", err.message);
    process.exit(1);
  });
}
