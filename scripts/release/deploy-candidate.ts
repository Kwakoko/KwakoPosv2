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

function run(command: string, encoding?: "utf8") {
  return execSync(command, encoding ? { encoding } : { stdio: "inherit" });
}

export function deployCandidateRevision(): CandidateDeploymentEvidence {
  console.log("----------------------------------------------------------------");
  console.log(" STEP 2 — Real Cloud Run Zero-Traffic Candidate Deployment     ");
  console.log("----------------------------------------------------------------");

  const isProdCert = process.env.NODE_ENV === "production-certification";
  const config = loadConfig();
  const gitSha = getRealGitSha();
  assertValidGitSha(gitSha);

  const region = process.env.GCP_REGION || "us-central1";
  const project = process.env.GCP_PROJECT || "kwakoposv2";
  const serviceName = process.env.CLOUD_RUN_SERVICE || "kwakopos-production-service";
  const imageRepository = `${region}-docker.pkg.dev/${project}/kwakopos/kwakopos2`;

  if (isProdCert && process.env.EXECUTE_GCLOUD !== "true") {
    throw new Error("RELEASE_BLOCKED: production-certification requires EXECUTE_GCLOUD=true");
  }

  let imageDigest = "";
  let candidateRevision = "";
  let candidateUrl = "";

  try {
    run("gcloud --version");
    run("docker --version");
    run(`gcloud auth configure-docker ${region}-docker.pkg.dev --quiet`);

    const tag = `${imageRepository}:${gitSha}`;
    console.log(`[DEPLOY] Building immutable container image ${tag}...`);
    run(`docker build -t ${tag} .`);
    run(`docker push ${tag}`);

    imageDigest = String(
      run(`gcloud artifacts docker images describe ${tag} --project=${project} --format="value(image_summary.digest)"`, "utf8")
    ).trim();
    assertValidContainerDigest(imageDigest);

    const fullImageRef = `${imageRepository}@${imageDigest}`;
    const tagArg = `rc-${gitSha.substring(0, 7)}`;

    const deployStdout = String(
      run(
        `gcloud run deploy ${serviceName} --project=${project} --image=${fullImageRef} --region=${region} --no-traffic --tag=${tagArg} --update-env-vars=NODE_ENV=production,GIT_SHA=${gitSha},CONTAINER_DIGEST=${imageDigest} --format="json"`,
        "utf8"
      )
    );
    const deployJson = JSON.parse(deployStdout);
    candidateRevision = deployJson?.status?.latestCreatedRevisionName || "";

    const serviceJson = JSON.parse(
      String(run(`gcloud run services describe ${serviceName} --project=${project} --region=${region} --format="json"`, "utf8"))
    );

    const taggedTraffic = Array.isArray(serviceJson?.status?.traffic)
      ? serviceJson.status.traffic.find((entry: any) => entry.tag === tagArg)
      : undefined;

    candidateRevision = taggedTraffic?.revisionName || candidateRevision;
    candidateUrl = taggedTraffic?.url || "";

    if (!candidateRevision) throw new Error("Cloud Run did not return a candidate revision");
    if (!candidateUrl) throw new Error(`Cloud Run tagged revision URL was not found for ${tagArg}`);
    assertValidCloudRunRevision(candidateRevision);

    const revisionJson = JSON.parse(
      String(run(`gcloud run revisions describe ${candidateRevision} --project=${project} --region=${region} --format="json"`, "utf8"))
    );
    const deployedImage = revisionJson?.spec?.containers?.[0]?.image || "";
    if (deployedImage !== fullImageRef) {
      throw new Error(`RELEASE_BLOCKED: Cloud Run revision image mismatch. Expected ${fullImageRef}; got ${deployedImage}`);
    }

    const candidateTraffic = taggedTraffic?.percent ?? 0;
    if (candidateTraffic !== 0) {
      throw new Error(`RELEASE_BLOCKED: candidate revision received ${candidateTraffic}% traffic before certification`);
    }

    console.log(`[PASS] Real Cloud Run candidate created with 0% traffic.`);
  } catch (err: any) {
    console.error(`RELEASE_BLOCKED: Real Cloud Run candidate deployment failed: ${err?.message || err}`);
    if (isProdCert) process.exit(1);
    throw err;
  }

  const evidence: CandidateDeploymentEvidence = {
    candidateRevision,
    candidateUrl,
    imageDigest,
    containerDigest: imageDigest,
    gitSha,
    version: config.APP_VERSION,
    timestamp: new Date().toISOString(),
  };

  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "kwakopos-candidate-deployment.json"), JSON.stringify(evidence, null, 2), "utf8");

  console.log(`[PASS] Candidate deployment evidence written:`);
  console.log(`       - Revision: ${evidence.candidateRevision}`);
  console.log(`       - URL:      ${evidence.candidateUrl}`);
  console.log(`       - Digest:   ${evidence.containerDigest}`);
  console.log(`       - SHA:      ${evidence.gitSha}`);

  return evidence;
}

if (process.argv[1] && process.argv[1].endsWith("deploy-candidate.ts")) {
  deployCandidateRevision();
}
