import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getRealGitSha } from "./releaseIdentity.js";
import { assertValidGitSha, assertValidContainerDigest, assertValidCloudRunRevision } from "@kwakopos2/domain";
import { loadConfig } from "@kwakopos2/config";

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

function quoteForPosixShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function assertRequiredProductionSecret(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production-certification") {
    throw new Error(`RELEASE_BLOCKED: required production secret ${name} is missing`);
  }
  return value || "";
}

function readContainerSourceSha(imageRef: string): string {
  try {
    run(`docker pull ${quoteForPosixShell(imageRef)}`);
  } catch (err: any) {
    throw new Error(`RELEASE_BLOCKED: unable to pull immutable candidate image for provenance inspection: ${err?.message || err}`);
  }

  const inspectOutput = String(run(`docker inspect ${quoteForPosixShell(imageRef)} --format='{{json .Config.Labels}}'`, "utf8")).trim();
  let labels: Record<string, string> = {};
  try {
    labels = JSON.parse(inspectOutput || "{}");
  } catch {
    throw new Error("RELEASE_BLOCKED: candidate container labels could not be parsed");
  }

  const sourceSha = String(labels["org.opencontainers.image.revision"] || "").trim();
  assertValidGitSha(sourceSha);
  return sourceSha;
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

  if (isProdCert) {
    assertRequiredProductionSecret("DATABASE_URL");
    assertRequiredProductionSecret("JWT_SECRET");
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
      existingDigest = String(
        run(`gcloud artifacts docker images describe ${tag} --project=${project} --format="value(image_summary.digest)"`, "utf8")
      ).trim();
    } catch {
      existingDigest = "";
    }

    if (existingDigest) {
      console.log(`[DEPLOY] Container image ${tag} already built and verified in registry (${existingDigest}).`);
      imageDigest = existingDigest;
    } else {
      console.log(`[DEPLOY] Building immutable container image ${tag}...`);
      try {
        run(`docker build --build-arg RELEASE_GIT_SHA=${quoteForPosixShell(gitSha)} --build-arg RELEASE_VERSION=${quoteForPosixShell(config.APP_VERSION)} -t ${quoteForPosixShell(tag)} .`);
        run(`docker push ${quoteForPosixShell(tag)}`);
      } catch {
        console.log(`[DEPLOY] Local docker build/push unavailable, submitting build to Cloud Build...`);
        run(`gcloud builds submit --config=cloudbuild.yaml --substitutions=_RELEASE_GIT_SHA=${gitSha},_RELEASE_VERSION=${config.APP_VERSION},_IMAGE=${tag} . --project=${quoteForPosixShell(project)}`);
      }
      imageDigest = String(
        run(`gcloud artifacts docker images describe ${tag} --project=${quoteForPosixShell(project)} --format="value(image_summary.digest)"`, "utf8")
      ).trim();
    }
    assertValidContainerDigest(imageDigest);

    const fullImageRef = `${imageRepository}@${imageDigest}`;
    const containerSourceSha = readContainerSourceSha(fullImageRef);
    if (containerSourceSha !== gitSha) {
      throw new Error(`RELEASE_BLOCKED: container source provenance mismatch. Release SHA=${gitSha}; image label SHA=${containerSourceSha}`);
    }

    const tagArg = `rc-${gitSha.substring(0, 7)}`;

    console.log(`[SERVICE_DISCOVERY] Checking if Cloud Run service '${serviceName}' exists in project '${project}'...`);
    let serviceExists = false;
    try {
      const serviceDescribe = String(
        run(`gcloud run services describe ${serviceName} --project=${quoteForPosixShell(project)} --region=${region} --format="json"`, "utf8")
      );
      const parsed = JSON.parse(serviceDescribe);
      serviceExists = Boolean(parsed?.metadata?.name);
    } catch {
      serviceExists = false;
    }

    deploymentMode = serviceExists ? "EXISTING_SERVICE" : "BOOTSTRAP";
    console.log(`[SERVICE_DISCOVERY] Selected Mode: ${deploymentMode}`);

    const databaseUrl = process.env.DATABASE_URL || "";
    const jwtSecret = process.env.JWT_SECRET || "";
    if (!databaseUrl || !jwtSecret) {
      throw new Error("RELEASE_BLOCKED: DATABASE_URL and JWT_SECRET must be provided explicitly; source-controlled fallbacks are forbidden");
    }

    const envFlags = `--update-env-vars=NODE_ENV=production,GIT_SHA=${quoteForPosixShell(gitSha)},CONTAINER_DIGEST=${quoteForPosixShell(imageDigest)},DATABASE_URL=${quoteForPosixShell(databaseUrl)},JWT_SECRET=${quoteForPosixShell(jwtSecret)}`;

    let deployStdout = "";
    if (deploymentMode === "EXISTING_SERVICE") {
      console.log(`[DEPLOY] Deploying candidate revision to existing service with 0% traffic...`);
      deployStdout = String(
        run(
          `gcloud run deploy ${quoteForPosixShell(serviceName)} --project=${quoteForPosixShell(project)} --image=${quoteForPosixShell(fullImageRef)} --region=${region} --memory=1Gi --cpu=1 --timeout=300s --no-traffic --allow-unauthenticated ${envFlags} --tag=${quoteForPosixShell(tagArg)} --format="json"`,
          "utf8"
        )
      );
    } else {
      console.log(`[DEPLOY] Creating initial Cloud Run service (bootstrap candidate path)...`);
      deployStdout = String(
        run(
          `gcloud run deploy ${quoteForPosixShell(serviceName)} --project=${quoteForPosixShell(project)} --image=${quoteForPosixShell(fullImageRef)} --region=${region} --memory=1Gi --cpu=1 --timeout=300s --allow-unauthenticated ${envFlags} --tag=${quoteForPosixShell(tagArg)} --format="json"`,
          "utf8"
        )
      );
    }

    const deployJson = JSON.parse(deployStdout);
    candidateRevision = deployJson?.status?.latestCreatedRevisionName || "";

    const serviceJson = JSON.parse(
      String(run(`gcloud run services describe ${quoteForPosixShell(serviceName)} --project=${quoteForPosixShell(project)} --region=${region} --format="json"`, "utf8"))
    );

    if (!candidateRevision) candidateRevision = serviceJson?.status?.latestCreatedRevisionName || "";

    const taggedTraffic = Array.isArray(serviceJson?.status?.traffic)
      ? serviceJson.status.traffic.find((entry: any) => entry.tag === tagArg || entry.revisionName === candidateRevision)
      : undefined;

    const baseServiceUrl = serviceJson?.status?.url || "";
    const computedTagUrl = baseServiceUrl.replace("https://", `https://${tagArg}---`);
    candidateUrl = taggedTraffic?.url || computedTagUrl;

    if (!candidateRevision) throw new Error("RELEASE_BLOCKED: Cloud Run did not return a candidate revision");
    if (!candidateUrl) throw new Error(`RELEASE_BLOCKED: Cloud Run candidate URL was not found for ${tagArg}`);
    if (!/^https:\/\//i.test(candidateUrl) || /localhost|127\.0\.0\.1/i.test(candidateUrl)) {
      throw new Error(`RELEASE_BLOCKED: invalid candidate URL returned: ${candidateUrl}`);
    }

    assertValidCloudRunRevision(candidateRevision);

    const revisionJson = JSON.parse(
      String(run(`gcloud run revisions describe ${quoteForPosixShell(candidateRevision)} --project=${quoteForPosixShell(project)} --region=${region} --format="json"`, "utf8"))
    );

    const isReady = Array.isArray(revisionJson?.status?.conditions)
      ? revisionJson.status.conditions.some((c: any) => c.type === "Ready" && c.status === "True")
      : false;
    if (!isReady) throw new Error(`RELEASE_BLOCKED: Cloud Run revision ${candidateRevision} is not Ready`);

    const deployedImage = revisionJson?.spec?.containers?.[0]?.image || "";
    if (deployedImage !== fullImageRef) {
      throw new Error(`RELEASE_BLOCKED: Cloud Run revision image mismatch. Expected ${fullImageRef}; got ${deployedImage}`);
    }

    const otherRevisionServingTraffic = Array.isArray(serviceJson?.status?.traffic)
      ? serviceJson.status.traffic.some((t: any) => t.revisionName && t.revisionName !== candidateRevision && (t.percent || 0) > 0)
      : false;

    if (deploymentMode === "EXISTING_SERVICE" && otherRevisionServingTraffic) {
      const candidateTraffic = taggedTraffic?.percent ?? 0;
      if (candidateTraffic !== 0) throw new Error(`RELEASE_BLOCKED: candidate revision received ${candidateTraffic}% traffic before certification`);
    }

    console.log(`[PASS] Cloud Run candidate revision ${candidateRevision} created (${deploymentMode}).`);

    const evidence: CandidateDeploymentEvidence = {
      deploymentMode,
      candidateRevision,
      candidateUrl,
      imageRef: fullImageRef,
      imageDigest,
      containerDigest: imageDigest,
      gitSha,
      containerSourceSha,
      version: config.APP_VERSION,
      timestamp: new Date().toISOString(),
    };

    const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, "kwakopos-candidate-deployment.json"), JSON.stringify(evidence, null, 2), "utf8");

    console.log(`[PASS] Candidate deployment evidence written with independently inspected container provenance.`);
    console.log(`       - Mode:          ${evidence.deploymentMode}`);
    console.log(`       - Revision:      ${evidence.candidateRevision}`);
    console.log(`       - URL:           ${evidence.candidateUrl}`);
    console.log(`       - Image:         ${evidence.imageRef}`);
    console.log(`       - Digest:        ${evidence.containerDigest}`);
    console.log(`       - Git SHA:       ${evidence.gitSha}`);
    console.log(`       - Container SHA: ${evidence.containerSourceSha}`);

    return evidence;
  } catch (err: any) {
    console.error(`RELEASE_BLOCKED: Real Cloud Run candidate deployment failed: ${err?.message || err}`);
    if (isProdCert) process.exit(1);
    throw err;
  }
}

if (process.argv[1] && process.argv[1].endsWith("deploy-candidate.ts")) {
  deployCandidateRevision();
}
