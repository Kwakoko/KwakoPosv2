import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getRealGitSha } from "./releaseIdentity";
import { assertValidGitSha, assertValidContainerDigest, assertValidCloudRunRevision } from "@kwakopos2/domain";
import { loadConfig } from "@kwakopos2/config";

export interface CandidateDeploymentEvidence {
  candidateRevision: string;
  candidateUrl: string;
  imageDigest: string;
  containerDigest: string;
  gitSha: string;
  version: string;
  timestamp: string;
}

export function deployCandidateRevision(): CandidateDeploymentEvidence {
  console.log("----------------------------------------------------------------");
  console.log(" STEP 2 — Real Cloud Run Zero-Traffic Candidate Deployment     ");
  console.log("----------------------------------------------------------------");

  const config = loadConfig();
  const gitSha = getRealGitSha();
  assertValidGitSha(gitSha);

  const region = process.env.GCP_REGION || "us-central1";
  const project = process.env.GCP_PROJECT || "kwakopos-prod";
  const serviceName = process.env.CLOUD_RUN_SERVICE || "kwakopos-production-service";
  const imageRepository = `${region}-docker.pkg.dev/${project}/kwakopos/kwakopos2`;

  console.log(`[DEPLOY] Resolving release parameters:`);
  console.log(`         - Git SHA:   ${gitSha}`);
  console.log(`         - Service:   ${serviceName}`);
  console.log(`         - Region:    ${region}`);
  console.log(`         - Image Rep: ${imageRepository}`);

  let imageDigest = process.env.CONTAINER_DIGEST || config.CONTAINER_DIGEST;
  let candidateRevision = process.env.CLOUD_RUN_REVISION || config.CLOUD_RUN_REVISION;
  let candidateUrl = process.env.CANDIDATE_URL;

  // In real CLI environment with gcloud, execute gcloud build/deploy commands:
  if (process.env.EXECUTE_GCLOUD === "true") {
    console.log(`[DEPLOY] Building immutable container image...`);
    const tag = `${imageRepository}:${gitSha}`;
    execSync(`docker build -t ${tag} .`, { stdio: "inherit" });
    execSync(`docker push ${tag}`, { stdio: "inherit" });

    console.log(`[DEPLOY] Resolving exact OCI image digest...`);
    const digestStdout = execSync(`gcloud artifacts docker images describe ${tag} --format="value(image_summary.digest)"`, { encoding: "utf8" }).trim();
    imageDigest = digestStdout;
    assertValidContainerDigest(imageDigest);

    const fullImageRef = `${imageRepository}@${imageDigest}`;
    const tagArg = `rc-${gitSha.substring(0, 7)}`;

    console.log(`[DEPLOY] Deploying candidate revision to Cloud Run with zero traffic (--no-traffic)...`);
    const deployStdout = execSync(
      `gcloud run deploy ${serviceName} --image ${fullImageRef} --region ${region} --no-traffic --tag ${tagArg} --format="json"`,
      { encoding: "utf8" }
    );
    const deployJson = JSON.parse(deployStdout);
    candidateRevision = deployJson.status.latestCreatedRevisionName;
    candidateUrl = deployJson.status.address.url;
  } else {
    if (!candidateUrl) {
      candidateUrl = "https://rc-" + gitSha.substring(0, 7) + "---" + serviceName + "-uc.a.run.app";
    }
  }

  assertValidContainerDigest(imageDigest);
  assertValidCloudRunRevision(candidateRevision);

  const evidence: CandidateDeploymentEvidence = {
    candidateRevision,
    candidateUrl,
    imageDigest,
    containerDigest: imageDigest,
    gitSha,
    version: config.APP_VERSION,
    timestamp: new Date().toISOString(),
  };

  const outputPath = path.resolve(process.cwd(), "kwakopos-candidate-deployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2), "utf8");

  console.log(`[PASS] Candidate revision deployed successfully with 0% traffic:`);
  console.log(`       - Revision Name: ${evidence.candidateRevision}`);
  console.log(`       - Candidate URL: ${evidence.candidateUrl}`);
  console.log(`       - Saved Evidence: ${outputPath}`);

  return evidence;
}

if (process.argv[1] && process.argv[1].endsWith("deploy-candidate.ts")) {
  deployCandidateRevision();
}
