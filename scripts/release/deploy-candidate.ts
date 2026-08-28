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
        run(`docker build -t ${tag} .`);
        run(`docker push ${tag}`);
      } catch (err: any) {
        console.log(`[DEPLOY] Local docker build/push unavailable, submitting build to Cloud Build...`);
        run(`gcloud builds submit --tag ${tag} . --project=${project}`);
      }
      imageDigest = String(
        run(`gcloud artifacts docker images describe ${tag} --project=${project} --format="value(image_summary.digest)"`, "utf8")
      ).trim();
    }
    assertValidContainerDigest(imageDigest);


    const fullImageRef = `${imageRepository}@${imageDigest}`;
    const tagArg = `rc-${gitSha.substring(0, 7)}`;

    console.log(`[SERVICE_DISCOVERY] Checking if Cloud Run service '${serviceName}' exists in project '${project}'...`);
    let serviceExists = false;
    try {
      const serviceDescribe = String(
        run(`gcloud run services describe ${serviceName} --project=${project} --region=${region} --format="json"`, "utf8")
      );
      const parsed = JSON.parse(serviceDescribe);
      serviceExists = Boolean(parsed?.metadata?.name);
    } catch {
      serviceExists = false;
    }

    deploymentMode = serviceExists ? "EXISTING_SERVICE" : "BOOTSTRAP";
    console.log(`[SERVICE_DISCOVERY] Selected Mode: ${deploymentMode}`);

    const databaseUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_mwvsp0AXBaF6@ep-divine-math-aydho7qc-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
    const jwtSecret = process.env.JWT_SECRET || "kwakopos-super-secret-jwt-key-change-in-production-min32chars";
    const envFlags = `--update-env-vars=NODE_ENV=production,GIT_SHA=${gitSha},CONTAINER_DIGEST=${imageDigest},DATABASE_URL="${databaseUrl}",JWT_SECRET="${jwtSecret}"`;

    let deployStdout = "";
    if (deploymentMode === "EXISTING_SERVICE") {
      console.log(`[DEPLOY] Deploying candidate revision to existing service with 0% traffic...`);
      deployStdout = String(
        run(
          `gcloud run deploy ${serviceName} --project=${project} --image=${fullImageRef} --region=${region} --no-traffic --allow-unauthenticated ${envFlags} --tag=${tagArg} --format="json"`,
          "utf8"
        )
      );
    } else {
      console.log(`[DEPLOY] Creating initial Cloud Run service (bootstrap candidate path)...`);
      deployStdout = String(
        run(
          `gcloud run deploy ${serviceName} --project=${project} --image=${fullImageRef} --region=${region} --allow-unauthenticated ${envFlags} --tag=${tagArg} --format="json"`,
          "utf8"
        )
      );
    }

    const deployJson = JSON.parse(deployStdout);
    candidateRevision = deployJson?.status?.latestCreatedRevisionName || "";

    const serviceJson = JSON.parse(
      String(run(`gcloud run services describe ${serviceName} --project=${project} --region=${region} --format="json"`, "utf8"))
    );

    if (!candidateRevision) {
      candidateRevision = serviceJson?.status?.latestCreatedRevisionName || "";
    }

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
      String(run(`gcloud run revisions describe ${candidateRevision} --project=${project} --region=${region} --format="json"`, "utf8"))
    );

    const isReady = Array.isArray(revisionJson?.status?.conditions)
      ? revisionJson.status.conditions.some((c: any) => c.type === "Ready" && c.status === "True")
      : false;
    if (!isReady) {
      throw new Error(`RELEASE_BLOCKED: Cloud Run revision ${candidateRevision} is not Ready`);
    }

    const deployedImage = revisionJson?.spec?.containers?.[0]?.image || "";
    if (deployedImage !== fullImageRef) {
      throw new Error(`RELEASE_BLOCKED: Cloud Run revision image mismatch. Expected ${fullImageRef}; got ${deployedImage}`);
    }

    const otherRevisionServingTraffic = Array.isArray(serviceJson?.status?.traffic)
      ? serviceJson.status.traffic.some((t: any) => t.revisionName && t.revisionName !== candidateRevision && (t.percent || 0) > 0)
      : false;

    if (deploymentMode === "EXISTING_SERVICE" && otherRevisionServingTraffic) {
      const candidateTraffic = taggedTraffic?.percent ?? 0;
      if (candidateTraffic !== 0) {
        throw new Error(`RELEASE_BLOCKED: candidate revision received ${candidateTraffic}% traffic before certification`);
      }
    }

    console.log(`[PASS] Cloud Run candidate revision ${candidateRevision} created (${deploymentMode}).`);
  } catch (err: any) {
    console.error(`RELEASE_BLOCKED: Real Cloud Run candidate deployment failed: ${err?.message || err}`);
    if (isProdCert) process.exit(1);
    throw err;
  }

  const evidence: CandidateDeploymentEvidence = {
    deploymentMode,
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
  console.log(`       - Mode:     ${evidence.deploymentMode}`);
  console.log(`       - Revision: ${evidence.candidateRevision}`);
  console.log(`       - URL:      ${evidence.candidateUrl}`);
  console.log(`       - Digest:   ${evidence.containerDigest}`);
  console.log(`       - SHA:      ${evidence.gitSha}`);

  return evidence;
}

if (process.argv[1] && process.argv[1].endsWith("deploy-candidate.ts")) {
  deployCandidateRevision();
}
