import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getRealGitSha } from "./releaseIdentity.js";
import { assertValidGitSha, assertValidContainerDigest, assertValidCloudRunRevision } from "@kwakopos2/domain";

export interface CandidateDeploymentEvidence {
  deploymentMode: "EXISTING_SERVICE" | "BOOTSTRAP";
  candidateRevision: string;
  candidateUrl: string;
  imageRef: string;
  imageDigest: string;
  containerDigest: string;
  gitSha: string;
  containerSourceSha: string;
  version: string;
  timestamp: string;
}

function run(command: string, encoding?: "utf8") {
  return execSync(command, encoding ? { encoding } : { stdio: "inherit" });
}

function quoteCliValue(value: string): string {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error("RELEASE_BLOCKED: invalid CLI value contains control characters");
  }
  if (!/^[A-Za-z0-9._:/@=+,-]+$/.test(value)) {
    throw new Error(`RELEASE_BLOCKED: unsafe CLI value: ${value}`);
  }
  return value;
}

function validateContainerProvenance(imageRef: string, expectedSha: string): string {
  try {
    run(`docker pull ${quoteCliValue(imageRef)}`);
    const raw = String(run(`docker inspect ${quoteCliValue(imageRef)} --format='{{json .Config.Labels}}'`, "utf8")).trim();
    const labels = JSON.parse(raw || "{}");
    const sourceSha = String(labels["org.opencontainers.image.revision"] || "").trim();
    assertValidGitSha(sourceSha);
    if (sourceSha !== expectedSha) throw new Error(`container source provenance mismatch: expected=${expectedSha} actual=${sourceSha}`);
    return sourceSha;
  } catch (err: any) {
    throw new Error(`RELEASE_BLOCKED: unable to independently verify container source provenance: ${err?.message || err}`);
  }
}

export function deployCandidateRevision(): CandidateDeploymentEvidence {
  console.log("----------------------------------------------------------------");
  console.log(" STEP 2 — Real Cloud Run Zero-Traffic Candidate Deployment     ");
  console.log("----------------------------------------------------------------");

  const isProdCert = process.env.NODE_ENV === "production-certification";
  const releaseManifestPath = path.resolve(process.cwd(), "release-manifest.json");
  const releaseManifest = JSON.parse(fs.readFileSync(releaseManifestPath, "utf8"));
  const releaseVersion = String(releaseManifest.version || releaseManifest.appVersion || "").trim();
  if (!releaseVersion) throw new Error("RELEASE_BLOCKED: authoritative release version is missing");
  const gitSha = getRealGitSha();
  assertValidGitSha(gitSha);

  const region = process.env.GCP_REGION || String(run("gcloud config get-value compute/region", "utf8")).trim();
  const project = process.env.GCP_PROJECT || String(run("gcloud config get-value project", "utf8")).trim();
  const serviceName = process.env.CLOUD_RUN_SERVICE || "kwakopos-production-service";
  if (!project || project === "(unset)" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/i.test(project)) {
    throw new Error(`RELEASE_BLOCKED: invalid GCP project id: ${project || "(unset)"}`);
  }
  if (!region || region === "(unset)") {
    throw new Error("RELEASE_BLOCKED: GCP region is not configured. Set GCP_REGION or gcloud compute/region.");
  }
  const imageRepository = `${region}-docker.pkg.dev/${project}/kwakopos/kwakopos2`;

  if (isProdCert && process.env.EXECUTE_GCLOUD !== "true") {
    throw new Error("RELEASE_BLOCKED: production-certification requires EXECUTE_GCLOUD=true");
  }

  let imageDigest = "";
  let candidateRevision = "";
  let candidateUrl = "";
  let deploymentMode: "EXISTING_SERVICE" | "BOOTSTRAP" = "EXISTING_SERVICE";

  try {
    run("gcloud --version");
    run("docker --version");
    run(`gcloud auth configure-docker ${region}-docker.pkg.dev --quiet`);

    const tag = `${imageRepository}:${gitSha}`;
    let existingDigest = "";
    try {
      existingDigest = String(run(`gcloud artifacts docker images describe ${tag} --project=${quoteCliValue(project)} --format="value(image_summary.digest)"`, "utf8")).trim();
    } catch {
      existingDigest = "";
    }

    if (existingDigest) {
      imageDigest = existingDigest;
    } else {
      try {
        run(`docker build --build-arg RELEASE_GIT_SHA=${quoteCliValue(gitSha)} --build-arg RELEASE_VERSION=${quoteCliValue(releaseVersion)} -t ${quoteCliValue(tag)} .`);
        run(`docker push ${quoteCliValue(tag)}`);
      } catch {
        run(`gcloud builds submit --config=cloudbuild.yaml --substitutions=_RELEASE_GIT_SHA=${gitSha},_RELEASE_VERSION=${releaseVersion},_IMAGE=${tag} . --project=${quoteCliValue(project)}`);
      }
      imageDigest = String(run(`gcloud artifacts docker images describe ${tag} --project=${quoteCliValue(project)} --format="value(image_summary.digest)"`, "utf8")).trim();
    }
    assertValidContainerDigest(imageDigest);

    const fullImageRef = `${imageRepository}@${imageDigest}`;
    const containerSourceSha = validateContainerProvenance(fullImageRef, gitSha);
    const tagArg = `rc-${gitSha.substring(0, 7)}`;

    let serviceExists = false;
    try {
      const serviceDescribe = String(run(`gcloud run services describe ${quoteCliValue(serviceName)} --project=${quoteCliValue(project)} --region=${region} --format="json"`, "utf8"));
      serviceExists = Boolean(JSON.parse(serviceDescribe)?.metadata?.name);
    } catch {
      serviceExists = false;
    }
    deploymentMode = serviceExists ? "EXISTING_SERVICE" : "BOOTSTRAP";

    // Secrets are injected from Secret Manager; secret values are never placed in shell arguments.
    const secretRefs = "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest";
    const envFlags = `--update-env-vars=NODE_ENV=production,GIT_SHA=${quoteCliValue(gitSha)},CONTAINER_DIGEST=${quoteCliValue(imageDigest)} --update-secrets=${secretRefs}`;

    let deployStdout = "";
    if (deploymentMode === "EXISTING_SERVICE") {
      deployStdout = String(run(`gcloud run deploy ${quoteCliValue(serviceName)} --project=${quoteCliValue(project)} --image=${quoteCliValue(fullImageRef)} --region=${region} --memory=1Gi --cpu=1 --timeout=300s --no-traffic --allow-unauthenticated ${envFlags} --tag=${quoteCliValue(tagArg)} --format="json"`, "utf8"));
    } else {
      deployStdout = String(run(`gcloud run deploy ${quoteCliValue(serviceName)} --project=${quoteCliValue(project)} --image=${quoteCliValue(fullImageRef)} --region=${region} --memory=1Gi --cpu=1 --timeout=300s --allow-unauthenticated ${envFlags} --tag=${quoteCliValue(tagArg)} --format="json"`, "utf8"));
    }

    const deployJson = JSON.parse(deployStdout);
    candidateRevision = deployJson?.status?.latestCreatedRevisionName || "";
    const serviceJson = JSON.parse(String(run(`gcloud run services describe ${quoteCliValue(serviceName)} --project=${quoteCliValue(project)} --region=${region} --format="json"`, "utf8")));
    if (!candidateRevision) candidateRevision = serviceJson?.status?.latestCreatedRevisionName || "";
    const taggedTraffic = Array.isArray(serviceJson?.status?.traffic) ? serviceJson.status.traffic.find((entry: any) => entry.tag === tagArg || entry.revisionName === candidateRevision) : undefined;
    const baseServiceUrl = serviceJson?.status?.url || "";
    candidateUrl = taggedTraffic?.url || baseServiceUrl.replace("https://", `https://${tagArg}---`);

    if (!candidateRevision) throw new Error("RELEASE_BLOCKED: Cloud Run did not return a candidate revision");
    if (!candidateUrl) throw new Error("RELEASE_BLOCKED: Cloud Run candidate URL was not found");
    if (!/^https:\/\//i.test(candidateUrl) || /localhost|127\.0\.0\.1/i.test(candidateUrl)) throw new Error(`RELEASE_BLOCKED: invalid candidate URL returned: ${candidateUrl}`);
    assertValidCloudRunRevision(candidateRevision);

    const revisionJson = JSON.parse(String(run(`gcloud run revisions describe ${quoteCliValue(candidateRevision)} --project=${quoteCliValue(project)} --region=${region} --format="json"`, "utf8")));
    const isReady = Array.isArray(revisionJson?.status?.conditions) ? revisionJson.status.conditions.some((c: any) => c.type === "Ready" && c.status === "True") : false;
    if (!isReady) throw new Error(`RELEASE_BLOCKED: Cloud Run revision ${candidateRevision} is not Ready`);
    const deployedImage = revisionJson?.spec?.containers?.[0]?.image || "";
    if (deployedImage !== fullImageRef) throw new Error(`RELEASE_BLOCKED: Cloud Run revision image mismatch. Expected ${fullImageRef}; got ${deployedImage}`);

    const evidence: CandidateDeploymentEvidence = { deploymentMode, candidateRevision, candidateUrl, imageRef: fullImageRef, imageDigest, containerDigest: imageDigest, gitSha, containerSourceSha, version: releaseVersion, timestamp: new Date().toISOString() };
    const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, "kwakopos-candidate-deployment.json"), JSON.stringify(evidence, null, 2), "utf8");
    return evidence;
  } catch (err: any) {
    console.error(`RELEASE_BLOCKED: Real Cloud Run candidate deployment failed: ${err?.message || err}`);
    if (isProdCert) process.exit(1);
    throw err;
  }
}

if (process.argv[1] && process.argv[1].endsWith("deploy-candidate.ts")) deployCandidateRevision();
