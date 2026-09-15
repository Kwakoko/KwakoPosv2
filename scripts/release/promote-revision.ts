import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import { assertReleaseIdentityMatch, assertVerifiedTrafficPromotion, assessProductionRelease } from "@kwakopos2/domain";
import { CandidateDeploymentEvidence } from "./deploy-candidate.js";

export interface PromotionEvidence {
  status: "PASS" | "FAIL";
  promotedRevision: string;
  productionUrl: string;
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
          resolve({ statusCode: res.statusCode || 500, data: JSON.parse(body) });
        } catch {
          resolve({ statusCode: res.statusCode || 500, data: body });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export async function promoteCandidateRevision(candidateInput?: CandidateDeploymentEvidence): Promise<PromotionEvidence> {
  const targetTrafficPercent = process.env.PROMOTION_PERCENT
    ? Math.max(1, Math.min(100, Number(process.env.PROMOTION_PERCENT)))
    : 100;

  console.log("----------------------------------------------------------------");
  console.log(` STEP 5 â€” Promote Certified Candidate Revision to ${targetTrafficPercent}% Traffic `);
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
      throw new Error(`PROMOTION_FAILURE: Missing candidate deployment file '${candidateFile}'.`);
    }
    candidate = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
  }

  const project = process.env.GCP_PROJECT || String(execSync("gcloud config get-value project", { encoding: "utf8" })).trim();
  const region = process.env.GCP_REGION || String(execSync("gcloud config get-value compute/region", { encoding: "utf8" })).trim();
  if (targetTrafficPercent > 0) {
    const gateFile = path.resolve(process.cwd(), "artifacts", "release-evidence", "kwakopos-production-release-gate.json");
    if (!fs.existsSync(gateFile)) throw new Error("RELEASE_BLOCKED: Step 25 production release gate evidence is missing");
    const gateEvidence = JSON.parse(fs.readFileSync(gateFile, "utf8"));
    const stage = targetTrafficPercent === 1 ? "PERCENT_1" : targetTrafficPercent === 5 ? "PERCENT_5" : targetTrafficPercent === 25 ? "PERCENT_25" : targetTrafficPercent === 50 ? "PERCENT_50" : "PERCENT_100";
    const assessment = assessProductionRelease(gateEvidence, stage as any);
    if (assessment.decision !== "PASS") throw new Error(`RELEASE_BLOCKED: Step 25 gate decision ${assessment.decision}: ${assessment.failedGates.join(", ")}`);
  }  if (!project || project === "(unset)") throw new Error("RELEASE_BLOCKED: GCP project is not configured");
  if (!region || region === "(unset)") throw new Error("RELEASE_BLOCKED: GCP region is not configured");
  const serviceName = process.env.CLOUD_RUN_SERVICE || "kwakopos-production-service";
  const digest = candidate.containerDigest || candidate.imageDigest;

  if (isProdCert && process.env.EXECUTE_GCLOUD !== "true") {
    console.error("RELEASE_BLOCKED: production-certification requires EXECUTE_GCLOUD=true for promotion.");
    process.exit(1);
  }

  try {
    execSync("gcloud --version", { stdio: "ignore" });
    const trafficArg = targetTrafficPercent === 100
      ? `${candidate.candidateRevision}=100`
      : `${candidate.candidateRevision}=${targetTrafficPercent}`;

    execSync(
      `gcloud run services update-traffic ${serviceName} --project=${project} --region=${region} --to-revisions=${trafficArg}`,
      { stdio: "inherit" },
    );

    const serviceJson = JSON.parse(
      execSync(
        `gcloud run services describe ${serviceName} --project=${project} --region=${region} --format="json"`,
        { encoding: "utf8" },
      ),
    );

    const trafficList = Array.isArray(serviceJson?.status?.traffic) ? serviceJson.status.traffic : [];
    const certifiedTraffic = trafficList.find((t: any) => t.revisionName === candidate.candidateRevision);
    const totalTraffic = trafficList.reduce((sum: number, t: any) => sum + Number(t.percent || 0), 0);

    if (!certifiedTraffic || certifiedTraffic.percent !== targetTrafficPercent) {
      throw new Error(`Traffic allocation mismatch: certified revision has ${certifiedTraffic?.percent || 0}% instead of ${targetTrafficPercent}%.`);
    }
    if (totalTraffic !== 100) {
      throw new Error(`Traffic allocation invalid: total reported traffic is ${totalTraffic}%, expected 100%.`);
    }

    const productionUrl = process.env.PRODUCTION_URL || serviceJson?.status?.url || "";
    if (!productionUrl || !/^https:\/\//i.test(productionUrl) || /localhost|127\.0\.0\.1/i.test(productionUrl)) {
      throw new Error(`RELEASE_BLOCKED: invalid live Cloud Run service URL '${productionUrl}'`);
    }

    const healthRes = await fetchHttpJson(`${productionUrl.replace(/\/$/, "")}/health`);
    if (healthRes.statusCode !== 200) throw new Error("PROMOTION_FAILURE: live /health failed after promotion");

    const versionRes = await fetchHttpJson(`${productionUrl.replace(/\/$/, "")}/version`);
    if (versionRes.statusCode !== 200) throw new Error("PROMOTION_FAILURE: live /version failed after promotion");

    const remoteIdentity = versionRes.data;
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
    assertVerifiedTrafficPromotion(true, targetTrafficPercent);

    const evidence: PromotionEvidence = {
      status: "PASS",
      promotedRevision: candidate.candidateRevision,
      productionUrl,
      trafficPercent: targetTrafficPercent,
      liveGitSha: liveIdentity.gitSha,
      liveContainerDigest: liveIdentity.containerDigest,
      liveCloudRunRevision: liveIdentity.cloudRunRevision,
      liveVersion: liveIdentity.appVersion,
      liveIdentityMatch: "PASS",
      timestamp: new Date().toISOString(),
    };

    const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, "kwakopos-promotion-evidence.json"), JSON.stringify(evidence, null, 2), "utf8");

    console.log("\nLIVE REVISION PROMOTION & IDENTITY VERIFICATION: PASS\n");
    console.log(`Production URL:    ${evidence.productionUrl}`);
    console.log(`Promoted Revision: ${evidence.promotedRevision}`);
    console.log(`Traffic Percent:   ${evidence.trafficPercent}%`);
    console.log(`Live Git SHA:      ${evidence.liveGitSha}`);
    console.log(`Live Digest:       ${evidence.liveContainerDigest}`);
    console.log(`Live Revision:     ${evidence.liveCloudRunRevision}`);
    console.log(`Live Version:      ${evidence.liveVersion}`);
    console.log(`Live Match:        ${evidence.liveIdentityMatch}`);

    return evidence;
  } catch (err: any) {
    if (isProdCert) {
      console.error(`RELEASE_BLOCKED: promotion/final live verification failed: ${err?.message || err}`);
      process.exit(1);
    }
    throw err;
  }
}

if (process.argv[1] && process.argv[1].endsWith("promote-revision.ts")) {
  promoteCandidateRevision().catch((err) => {
    console.error("PROMOTION FAILURE:", err.message);
    process.exit(1);
  });
}
import { assessProductionRelease } from "@kwakopos2/domain";
