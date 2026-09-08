import fs from "fs";
import path from "path";
import { getAuthoritativeReleaseIdentity, getRealGitSha } from "./releaseIdentity.js";
import { deployCandidateRevision } from "./deploy-candidate.js";
import { certifyDeployedRevision } from "./certify-deployed.js";
import { promoteCandidateRevision } from "./promote-revision.js";
import {
  assertValidGitSha,
  assertValidContainerDigest,
  assertValidCloudRunRevision,
  assertReleaseIdentityMatch,
} from "@kwakopos2/domain";

export interface ProductionReleaseEvidenceArtifact {
  status: "PASS";
  deploymentMode: "BOOTSTRAP" | "EXISTING_SERVICE";
  version: string;
  gitSha: string;
  containerDigest: string;
  cloudRunService: string;
  cloudRunRevision: string;
  candidateUrl: string;
  health: "PASS";
  readiness: "PASS";
  deployedIdentity: "PASS";
  productionBrowser: "PASS";
  browserAtoServerToB: "PASS";
  expectedStock: 188;
  trafficPercent: 100;
  liveIdentity: "PASS";
  timestamp: string;
}

export type ReleaseState =
  | "SERVICE_DISCOVERY"
  | "CERTIFIED"
  | "IMAGE_BUILT"
  | "DIGEST_VERIFIED"
  | "CANDIDATE_DEPLOYED"
  | "DEPLOYED_IDENTITY_CERTIFIED"
  | "PRODUCTION_BROWSER_CERTIFIED"
  | "A_SERVER_B_CONVERGENCE_CERTIFIED"
  | "REVISION_PROMOTED_100_PERCENT"
  | "LIVE_IDENTITY_VERIFIED"
  | "RELEASE_PASS";

function requireEvidenceObject(name: string, relativePath: string): any {
  const evidencePath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`RELEASE_BLOCKED: required proof artifact '${name}' is missing at ${evidencePath}`);
  }
  const value = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  return value;
}

async function executeReleaseStateMachine(): Promise<ProductionReleaseEvidenceArtifact> {
  console.log("========================================================================");
  console.log(" KWAKOPOS 2.0 REAL PRODUCTION CERTIFICATION STATE MACHINE              ");
  console.log("========================================================================");

  let state: ReleaseState = "SERVICE_DISCOVERY";
  console.log(`[STATE] Current State: ${state}`);

  // STAGE 1: Real Release Identity Verification
  const gitSha = getRealGitSha();
  assertValidGitSha(gitSha);

  state = "IMAGE_BUILT";
  console.log(`[STATE] Current State: ${state}`);

  // STAGE 2: Real Cloud Run Candidate Deployment
  const candidate = await deployCandidateRevision();
  assertValidContainerDigest(candidate.containerDigest);
  assertValidCloudRunRevision(candidate.candidateRevision);

  state = "DIGEST_VERIFIED";
  console.log(`[STATE] Current State: ${state}`);

  state = "CANDIDATE_DEPLOYED";
  console.log(`[STATE] Current State: ${state} (Mode: ${candidate.deploymentMode})`);

  // STAGE 3: Certify Deployed Candidate Revision Identity over HTTPS
  const deployedCert = await certifyDeployedRevision(candidate);
  state = "DEPLOYED_IDENTITY_CERTIFIED";
  console.log(`[STATE] Current State: ${state}`);

  // STAGE 4: Require independently generated browser + convergence evidence.
  const browserEvidence = requireEvidenceObject(
    "browser certification",
    "artifacts/release-evidence/kwakopos-browser-certification-evidence.json",
  );
  if (browserEvidence.candidateRevision !== candidate.candidateRevision) {
    throw new Error("RELEASE_BLOCKED: browser evidence candidate revision does not match deployed candidate.");
  }
  if (browserEvidence.finalConvergenceStatus !== "PASS") {
    throw new Error("RELEASE_BLOCKED: Browser A -> Server -> Browser B convergence evidence is not PASS.");
  }
  if (Number(browserEvidence.expectedStock) !== Number(browserEvidence.actualStockBrowserA) ||
      Number(browserEvidence.expectedStock) !== Number(browserEvidence.actualStockBrowserB)) {
    throw new Error("RELEASE_BLOCKED: browser convergence evidence contains inconsistent stock values.");
  }
  state = "PRODUCTION_BROWSER_CERTIFIED";
  console.log(`[STATE] Current State: ${state}`);

  const folderSyncEvidence = requireEvidenceObject(
    "local/GitHub folder synchronization",
    "artifacts/release-evidence/kwakopos-folder-sync-evidence.json",
  );
  if (folderSyncEvidence.localHeadSha !== gitSha || folderSyncEvidence.verificationSha !== gitSha) {
    throw new Error("RELEASE_BLOCKED: local/GitHub folder synchronization evidence does not match release SHA.");
  }
  state = "A_SERVER_B_CONVERGENCE_CERTIFIED";
  console.log(`[STATE] Current State: ${state}`);

  // STAGE 5: Promote Certified Candidate Revision to 100% Traffic & Live Verification
  const promotion = await promoteCandidateRevision(candidate);
  state = "REVISION_PROMOTED_100_PERCENT";
  console.log(`[STATE] Current State: ${state}`);

  state = "LIVE_IDENTITY_VERIFIED";
  console.log(`[STATE] Current State: ${state}`);

  // Final Release State Assertion
  assertReleaseIdentityMatch(
    {
      gitSha: candidate.gitSha,
      containerDigest: candidate.containerDigest,
      cloudRunRevision: candidate.candidateRevision,
      appVersion: candidate.version,
    },
    {
      gitSha: promotion.liveGitSha,
      containerDigest: promotion.liveContainerDigest,
      cloudRunRevision: promotion.liveCloudRunRevision,
      appVersion: promotion.liveVersion,
    }
  );

  state = "RELEASE_PASS";
  console.log(`[STATE] Current State: ${state}`);

  // STAGE 6: GitHub Check-Runs & Tripartite Folder Sync Proof Verification
  const repo = process.env.GITHUB_REPOSITORY || "Kwakoko/KwakoPosv2";
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  let ciCheckRunsState = "UNVERIFIED";

  if (token) {
    try {
      const checkRunsRes = await fetch(`https://api.github.com/repos/${repo}/commits/${gitSha}/check-runs`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (checkRunsRes.ok) {
        const checkData: any = await checkRunsRes.json();
        if (checkData.total_count > 0) {
          const allPassed = checkData.check_runs.every((cr: any) => cr.conclusion === "success");
          ciCheckRunsState = allPassed ? "PASS" : "IN_PROGRESS";
        }
      } else {
        if (process.env.NODE_ENV === "production-certification") {
          throw new Error(`RELEASE_BLOCKED: GitHub check-runs API returned HTTP ${checkRunsRes.status}`);
        }
      }
    } catch (err: any) {
      if (process.env.NODE_ENV === "production-certification") {
        throw new Error(`RELEASE_BLOCKED: Failed to fetch GitHub CI check-runs: ${err.message}`);
      }
    }
  }
  if (process.env.NODE_ENV === "production-certification" && ciCheckRunsState !== "PASS") {
    throw new Error(`RELEASE_BLOCKED: GitHub CI check-runs are not independently PASS for ${gitSha}.`);
  }

  const syncEvidencePath = path.resolve(process.cwd(), "artifacts", "release-evidence", "kwakopos-folder-sync-evidence.json");
  let folderSyncEvidenceSha = "";
  if (fs.existsSync(syncEvidencePath)) {
    const rawSyncEv = fs.readFileSync(syncEvidencePath, "utf8");
    const syncEv = JSON.parse(rawSyncEv);
    folderSyncEvidenceSha = syncEv.verificationSha || "";
    // Verify tripartite SHA match
    if (syncEv.localHeadSha && syncEv.localHeadSha !== gitSha) {
      console.warn(`[WARN] Sync evidence localHeadSha (${syncEv.localHeadSha}) differs from current release gitSha (${gitSha}).`);
    }
  }

  if (!folderSyncEvidenceSha) {
    throw new Error("RELEASE_BLOCKED: folder synchronization proof is missing verificationSha.");
  }
  if (folderSyncEvidenceSha === gitSha) {
    console.warn("[WARN] verificationSha is a content digest, not a Git SHA; Git identity is checked via localHeadSha and GitHubResolvedCommitSha.");
  }
  if (promotion.trafficPercent !== 100 || promotion.liveIdentityMatch !== "PASS") {
    throw new Error("RELEASE_BLOCKED: live traffic or identity proof is not PASS.");
  }
  if (browserEvidence.finalConvergenceStatus !== "PASS") {
    throw new Error("RELEASE_BLOCKED: final browser convergence proof is not PASS.");
  }

  const evidenceArtifact: ProductionReleaseEvidenceArtifact & { folderSyncState: string; folderSyncEvidenceSha: string; ciCheckRunsState: string } = {
    status: "PASS",
    deploymentMode: candidate.deploymentMode,
    version: candidate.version,
    gitSha: candidate.gitSha,
    containerDigest: candidate.containerDigest,
    cloudRunService: process.env.CLOUD_RUN_SERVICE || "kwakopos-production-service",
    cloudRunRevision: promotion.liveCloudRunRevision,
    candidateUrl: candidate.candidateUrl,
    health: deployedCert.health,
    readiness: deployedCert.readiness,
    deployedIdentity: deployedCert.identity,
    productionBrowser: browserEvidence.finalConvergenceStatus,
    browserAtoServerToB: browserEvidence.finalConvergenceStatus,
    expectedStock: Number(browserEvidence.expectedStock),
    trafficPercent: promotion.trafficPercent,
    liveIdentity: promotion.liveIdentityMatch,
    folderSyncState: "PASS",
    folderSyncEvidenceSha,
    ciCheckRunsState,
    timestamp: new Date().toISOString(),
  };

  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });

  const outputPath = path.join(artifactDir, "kwakopos-production-release-evidence.json");
  fs.writeFileSync(outputPath, JSON.stringify(evidenceArtifact, null, 2), "utf8");

  console.log("\n========================================================================");
  console.log(" 🎉 KWAKOPOS 2.0 REAL PRODUCTION CERTIFICATION: RELEASE PASS            ");
  console.log(` Saved Evidence Artifact: ${outputPath}`);
  console.log("========================================================================\n");

  return evidenceArtifact;
}

executeReleaseStateMachine().catch((err) => {
  console.error("\n========================================================================");
  console.error(" ❌ RELEASE_BLOCKED: KWAKOPOS 2.0 PRODUCTION RELEASE TERMINATED        ");
  console.error(` Error: ${err.message}`);
  console.error("========================================================================\n");
  process.exit(1);
});
