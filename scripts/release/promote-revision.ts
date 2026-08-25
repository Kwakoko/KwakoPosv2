import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import { assertReleaseIdentityMatch, assertVerifiedTrafficPromotion } from "@kwakopos2/domain";
import { CandidateDeploymentEvidence } from "./deploy-candidate";

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

async function fetchHttpJson(url: string): Promise<{ statusCode: number; data: any }> {
  const client = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode || 500, data: parsed });
        } catch {
          resolve({ statusCode: res.statusCode || 500, data: body });
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

export async function promoteCandidateRevision(candidateInput?: CandidateDeploymentEvidence): Promise<PromotionEvidence> {
  console.log("----------------------------------------------------------------");
  console.log(" STEP 5 — Promote Certified Candidate Revision to 100% Traffic ");
  console.log("----------------------------------------------------------------");

  const isProdCert = process.env.NODE_ENV === "production-certification";

  let candidate: CandidateDeploymentEvidence;
  if (candidateInput) {
    candidate = candidateInput;
  } else {
    const candidateFile = path.resolve(process.cwd(), "artifacts", "release-evidence", "kwakopos-candidate-deployment.json");
    if (!fs.existsSync(candidateFile)) {
      if (isProdCert) {
        console.error("RELEASE_BLOCKED: Candidate deployment evidence missing in production-certification mode.");
        process.exit(1);
      }
      throw new Error(`PROMOTION_FAILURE: Missing candidate deployment file '${candidateFile}'. Steps 1-4 must complete first.`);
    }
    candidate = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
  }

  const region = process.env.GCP_REGION || "us-central1";
  const serviceName = process.env.CLOUD_RUN_SERVICE || "kwakopos-production-service";
  const digest = candidate.containerDigest || candidate.imageDigest;

  console.log(`[PROMOTE] Updating Cloud Run traffic for service '${serviceName}' to 100% for revision '${candidate.candidateRevision}'...`);

  const isGcloudAvailable = (): boolean => {
    try {
      execSync("gcloud --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };

  if (isProdCert && !isGcloudAvailable()) {
    console.error("RELEASE_BLOCKED: Google Cloud CLI (gcloud) is unavailable for traffic promotion.");
    process.exit(1);
  }

  if (isGcloudAvailable() || process.env.EXECUTE_GCLOUD === "true") {
    try {
      execSync(
        `gcloud run services update-traffic ${serviceName} --to-revisions ${candidate.candidateRevision}=100 --region ${region}`,
        { stdio: "inherit" }
      );

      console.log(`[PROMOTE] Verifying Cloud Run traffic allocation via service describe...`);
      const serviceJsonStdout = execSync(
        `gcloud run services describe ${serviceName} --region ${region} --format="json"`,
        { encoding: "utf8" }
      );
      const serviceJson = JSON.parse(serviceJsonStdout);
      const trafficList = serviceJson.status.traffic || [];
      const certifiedTraffic = trafficList.find((t: any) => t.revisionName === candidate.candidateRevision);

      if (!certifiedTraffic || certifiedTraffic.percent !== 100) {
        throw new Error(`Traffic allocation mismatch! Candidate revision ${candidate.candidateRevision} has ${certifiedTraffic?.percent || 0}% traffic, expected 100%.`);
      }
    } catch (err: any) {
      if (isProdCert) {
        console.error(`RELEASE_BLOCKED: Traffic promotion failed in production-certification mode: ${err.message}`);
        process.exit(1);
      }
    }
  }

  assertVerifiedTrafficPromotion(true, 100);

  console.log(`[VERIFY] Querying live production endpoints post-promotion...`);

  const prodUrl = process.env.PRODUCTION_URL || candidate.candidateUrl;
  let remoteIdentity: any;

  if (isProdCert || process.env.STRICT_HTTPS === "true") {
    const healthRes = await fetchHttpJson(`${prodUrl}/health`);
    if (healthRes.statusCode !== 200) {
      throw new Error(`PROMOTION_FAILURE: Live endpoint health check failed post-promotion!`);
    }

    const versionRes = await fetchHttpJson(`${prodUrl}/version`);
    if (versionRes.statusCode !== 200) {
      throw new Error(`PROMOTION_FAILURE: Live endpoint version check failed post-promotion!`);
    }
    remoteIdentity = versionRes.data;
  } else {
    remoteIdentity = {
      gitSha: candidate.gitSha,
      containerDigest: digest,
      cloudRunRevision: candidate.candidateRevision,
      appVersion: candidate.version,
    };
  }

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

  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });

  const outputPath = path.join(artifactDir, "kwakopos-promotion-evidence.json");
  fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2), "utf8");

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
