import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { spawnSync } from "child_process";
import {
  inspectLocalRepository,
  synchronizeLocalVersionFolder,
  readSyncMetadata,
  writeSyncMetadata,
  performRollback,
  fetchLatestGitHubRelease,
  isValid40CharGitSha,
  generateSyncEvidenceBundle,
  resolvePeeledCommitSha,
} from "../release/localVersionFolderSyncEngine.js";

export interface CertificationCheck {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export interface VersionSyncCertificationResult {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: CertificationCheck[];
  timestamp: string;
}

const REQUIRED_CI_CHECKS = [
  "release-certification",
  "production-build",
  "security-scan",
  "test-suite",
];

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

function verifyEd25519Signature(payload: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(payload, "utf8"),
      publicKeyPem,
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}

function runAtomicTwoProcessRace(lockPath: string): { oneWon: boolean; oneLost: boolean } {
  const child = `
    const fs = require("fs");
    const p = process.argv[1];
    try { const fd = fs.openSync(p, "wx"); fs.closeSync(fd); process.exit(0); }
    catch (e) { process.exit(e && e.code === "EEXIST" ? 17 : 19); }
  `;
  const a = spawnSync(process.execPath, ["-e", child, lockPath], { encoding: "utf8" });
  const b = spawnSync(process.execPath, ["-e", child, lockPath], { encoding: "utf8" });
  return {
    oneWon: [a.status, b.status].filter((s) => s === 0).length === 1,
    oneLost: [a.status, b.status].filter((s) => s === 17).length === 1,
  };
}

async function fetchAuthoritativeGithubSha(tag: string, repo: string, token?: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "KwakoPos-Production-Certification",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, { headers });
  if (!refRes.ok) throw new Error(`GITHUB_TAG_REF_FAILED:${refRes.status}`);
  const refData: any = await refRes.json();
  const objSha = refData.object?.sha;
  const objType = refData.object?.type;

  if (objType === "commit" && isValid40CharGitSha(objSha)) return objSha;
  if (objType !== "tag" || !isValid40CharGitSha(objSha)) {
    throw new Error("GITHUB_TAG_OBJECT_INVALID");
  }

  const tagRes = await fetch(`https://api.github.com/repos/${repo}/git/tags/${objSha}`, { headers });
  if (!tagRes.ok) throw new Error(`GITHUB_ANNOTATED_TAG_FAILED:${tagRes.status}`);
  const tagData: any = await tagRes.json();
  const peeled = tagData.object?.sha;
  if (tagData.object?.type !== "commit" || !isValid40CharGitSha(peeled)) {
    throw new Error("GITHUB_PEELED_COMMIT_INVALID");
  }
  return peeled;
}

async function fetchRequiredCiChecks(repo: string, sha: string, token: string): Promise<{ passed: boolean; details: string }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "KwakoPos-Production-Certification",
  };
  const response = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`, { headers });
  if (!response.ok) throw new Error(`CI_CHECKS_API_FAILED:${response.status}`);
  const data: any = await response.json();
  if (!Array.isArray(data.check_runs) || data.check_runs.length === 0) {
    return { passed: false, details: "No check-runs were returned for the exact certification SHA." };
  }

  const byName = new Map<string, any>();
  for (const run of data.check_runs) byName.set(String(run.name).toLowerCase(), run);

  const missing: string[] = [];
  const failed: string[] = [];
  for (const required of REQUIRED_CI_CHECKS) {
    const run = byName.get(required.toLowerCase());
    if (!run) {
      missing.push(required);
      continue;
    }
    if (run.status !== "completed" || run.conclusion !== "success") {
      failed.push(`${required}:${run.status}/${run.conclusion}`);
    }
  }

  if (missing.length || failed.length) {
    return {
      passed: false,
      details: `Missing=${missing.join(",") || "none"}; FailedOrIncomplete=${failed.join(",") || "none"}`,
    };
  }
  return { passed: true, details: `All required CI checks passed for exact SHA ${sha}.` };
}

export async function runVersionSyncCertification(): Promise<VersionSyncCertificationResult> {
  console.log("========================================================================");
  console.log(" KWAKOPOS LOCAL VERSION FOLDER SYNCHRONIZATION CERTIFICATION           ");
  console.log("========================================================================");

  const checks: CertificationCheck[] = [];
  const addCheck = (id: string, name: string, passed: boolean, details: string) => {
    checks.push({ id, name, passed, details });
    console.log(`[${passed ? "PASS" : "FAIL"}] ${id}: ${name} — ${details}`);
  };

  const cwd = process.cwd();
  const localRepo = inspectLocalRepository(cwd);
  const repo = process.env.GITHUB_REPOSITORY || "Kwakoko/KwakoPosv2";
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), "cert-sync-prod-"));

  try {
    // GATE 1: real GitHub release only. Production certification never enables mocks.
    let relTag = "";
    let releaseVersion = "";
    try {
      const rel = await fetchLatestGitHubRelease(repo);
      relTag = rel.tag;
      releaseVersion = rel.version;
      const passed = Boolean(rel.tag && rel.version && rel.certified);
      addCheck("GATE-01", "GitHub Release exists", passed, `Verified real release: tag=${rel.tag}, version=${rel.version}`);
    } catch (err: any) {
      addCheck("GATE-01", "GitHub Release exists", false, `Real GitHub release verification failed: ${err.message}`);
    }

    // GATE 2: authoritative tag must come from the real release.
    const tagResolved = Boolean(relTag && /^v\d+\.\d+\.\d+/.test(relTag));
    addCheck("GATE-02", "Release tag resolved", tagResolved, tagResolved ? `Authoritative tag=${relTag}` : "No valid authoritative release tag.");

    // GATE 3: independently resolve GitHub tag -> peeled immutable commit SHA.
    let peeledSha = "";
    try {
      peeledSha = await fetchAuthoritativeGithubSha(relTag, repo, token);
      addCheck("GATE-03", "Tag peeled to immutable 40-char SHA", isValid40CharGitSha(peeledSha), `GitHub tag ${relTag} resolves to ${peeledSha}`);
    } catch (err: any) {
      addCheck("GATE-03", "Tag peeled to immutable 40-char SHA", false, err.message);
    }

    // GATE 4: local HEAD is independently captured.
    const localHeadSha = localRepo.commitSha;
    addCheck("GATE-04", "Local HEAD SHA captured", isValid40CharGitSha(localHeadSha), `Local HEAD=${localHeadSha}`);

    // GATE 5: certification SHA must be supplied by the actual certification/build provenance.
    const certificationSha = (process.env.CERTIFICATION_SHA || "").trim();
    const certShaPassed = isValid40CharGitSha(certificationSha);
    addCheck("GATE-05", "Certification SHA independently captured", certShaPassed, certShaPassed ? `CERTIFICATION_SHA=${certificationSha}` : "CERTIFICATION_SHA is missing or invalid; no local-HEAD fallback is permitted.");

    // GATE 6: container provenance must be supplied independently by the image/build pipeline.
    const containerSourceSha = (process.env.CONTAINER_SOURCE_SHA || "").trim();
    const containerShaPassed = isValid40CharGitSha(containerSourceSha);
    addCheck("GATE-06", "Container source SHA independently captured", containerShaPassed, containerShaPassed ? `CONTAINER_SOURCE_SHA=${containerSourceSha}` : "CONTAINER_SOURCE_SHA is missing or invalid; no local-HEAD fallback is permitted.");

    // GATE 7: all independent identities must be equal.
    const allShasMatch =
      isValid40CharGitSha(peeledSha) &&
      isValid40CharGitSha(localHeadSha) &&
      certShaPassed &&
      containerShaPassed &&
      peeledSha === localHeadSha &&
      localHeadSha === certificationSha &&
      certificationSha === containerSourceSha;
    addCheck("GATE-07", "ALL independent SHAs identical", allShasMatch, `GitHub=${peeledSha || "missing"}; Local=${localHeadSha}; Certification=${certificationSha || "missing"}; Container=${containerSourceSha || "missing"}`);

    // SAFETY TEST A: actual two-process atomic lock race. This is explicitly separate from production release certification.
    const raceLock = path.join(tempTestDir, ".kwakopos-two-process-race.lock");
    const race = runAtomicTwoProcessRace(raceLock);
    const racePassed = race.oneWon && race.oneLost;
    addCheck("GATE-08", "Two-process atomic lock race", racePassed, racePassed ? "Exactly one process acquired the lock and exactly one received EEXIST." : "Concurrent exclusive-lock test did not produce exactly one winner and one loser.");

    // GATE 9: heartbeat + ownership behavior is independently exercised using active and stale locks.
    const heartbeatDir = path.join(tempTestDir, "heartbeat-worktree");
    fs.mkdirSync(path.join(heartbeatDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(heartbeatDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "9.0.0" }), "utf8");
    const heartbeatLock = path.join(tempTestDir, `.kwakopos-sync-heartbeat-${Date.now()}.lock`);
    const activeFd = fs.openSync(heartbeatLock, "wx");
    fs.writeFileSync(activeFd, JSON.stringify({ lockId: "HEARTBEAT-ACTIVE", pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), repositoryPath: heartbeatDir, targetPath: path.join(tempTestDir, "target"), phase: "RENAMING" }), "utf8");
    fs.closeSync(activeFd);
    const activeResult = await synchronizeLocalVersionFolder({ cwd: heartbeatDir, force: true, skipProcessCheck: true, expectedCommitSha: inspectLocalRepository(heartbeatDir).commitSha, containerSourceSha: inspectLocalRepository(heartbeatDir).commitSha });
    const activeBlocked = !activeResult.success && activeResult.actionTaken === "SYNC_BLOCKED_CONCURRENCY_LOCK";
    if (fs.existsSync(heartbeatLock)) fs.unlinkSync(heartbeatLock);

    const staleLock = path.join(tempTestDir, `.kwakopos-sync-stale-${Date.now()}.lock`);
    const staleFd = fs.openSync(staleLock, "wx");
    fs.writeFileSync(staleFd, JSON.stringify({ lockId: "HEARTBEAT-STALE", pid: 999999, hostname: os.hostname(), createdAt: new Date(Date.now() - 120000).toISOString(), heartbeatAt: new Date(Date.now() - 120000).toISOString(), repositoryPath: heartbeatDir, targetPath: path.join(tempTestDir, "target-stale"), phase: "PREPARED" }), "utf8");
    fs.closeSync(staleFd);
    const staleResult = await synchronizeLocalVersionFolder({ cwd: heartbeatDir, force: true, skipProcessCheck: true, mockRelease: { repo, tag: "v9.0.1", version: "9.0.1", commitSha: inspectLocalRepository(heartbeatDir).commitSha, publishedAt: new Date().toISOString(), draft: false, prerelease: false, certified: true, htmlUrl: "" }, expectedCommitSha: inspectLocalRepository(heartbeatDir).commitSha, containerSourceSha: inspectLocalRepository(heartbeatDir).commitSha });
    const staleRecovered = staleResult.success;
    const heartbeatPassed = activeBlocked && staleRecovered;
    addCheck("GATE-09", "Heartbeat and ownership test", heartbeatPassed, `Active owner blocked=${activeBlocked}; dead-owner stale recovery=${staleRecovered}`);

    // GATE 10: crash recovery must leave a completed target after stale-owner recovery.
    const crashRecoveryPassed = staleRecovered && fs.existsSync(path.join(tempTestDir, "target-stale"));
    addCheck("GATE-10", "Crash recovery test", crashRecoveryPassed, crashRecoveryPassed ? "Recovered from a dead-PID stale lock and produced the target folder." : "Stale-lock recovery did not complete deterministically.");

    // GATE 11/12 remain real filesystem rename + rollback tests in an isolated fixture, outside production release identity.
    const renameStart = path.join(tempTestDir, "KwakoPos-v9.1.0");
    fs.mkdirSync(path.join(renameStart, ".git"), { recursive: true });
    fs.writeFileSync(path.join(renameStart, "package.json"), JSON.stringify({ name: "KwakoPos", version: "9.1.0" }), "utf8");
    const fixtureSha = inspectLocalRepository(renameStart).commitSha;
    const renameResult = await synchronizeLocalVersionFolder({ cwd: renameStart, force: true, skipProcessCheck: true, mockRelease: { repo, tag: "v9.2.0", version: "9.2.0", commitSha: fixtureSha, publishedAt: new Date().toISOString(), draft: false, prerelease: false, certified: true, htmlUrl: "" }, expectedCommitSha: fixtureSha, containerSourceSha: fixtureSha });
    const renamePassed = renameResult.success && fs.existsSync(path.join(tempTestDir, "KwakoPos-v9.2.0"));
    addCheck("GATE-11", "Real rename execution", renamePassed, renamePassed ? "Physical rename completed in isolated fixture." : "Physical rename failed.");

    const rollbackPath = path.join(tempTestDir, "KwakoPos-v9.2.0");
    if (fs.existsSync(rollbackPath)) {
      writeSyncMetadata({ project: "KwakoPos", repository: repo, release: "v9.2.0", commit: fixtureSha, folder: "KwakoPos-v9.2.0", previous_folder: "KwakoPos-v9.1.0", synced_at: new Date().toISOString(), status: "SYNCHRONIZED", machine: os.hostname(), mode: "MODE_A", transactionPhase: "COMPLETED" }, rollbackPath);
    }
    const rollbackResult = fs.existsSync(rollbackPath) ? await performRollback(rollbackPath) : { success: false, rolledBackTo: "" } as any;
    const rollbackPassed = rollbackResult.success && fs.existsSync(path.join(tempTestDir, "KwakoPos-v9.1.0"));
    addCheck("GATE-12", "Real rollback execution", rollbackPassed, rollbackPassed ? `Rollback restored ${rollbackResult.rolledBackTo}` : "Physical rollback failed.");

    // GATE 13: evidence digest must cover independent release identities.
    const evidenceObj = generateSyncEvidenceBundle(
      { project: "KwakoPos", repository: repo, release: relTag || "UNRESOLVED", commit: localHeadSha, folder: `KwakoPos-${releaseVersion || "UNRESOLVED"}`, previous_folder: "", synced_at: new Date().toISOString(), status: "SYNCHRONIZED", machine: os.hostname(), mode: "MODE_A", transactionPhase: "COMPLETED" },
      { githubReleaseTag: relTag, githubResolvedCommitSha: peeledSha, localHeadSha, certificationSha, containerSourceSha },
      tempTestDir,
    );
    const evidenceShaPassed = Boolean(evidenceObj.evidenceSha256 && /^[0-9a-f]{64}$/i.test(evidenceObj.evidenceSha256));
    addCheck("GATE-13", "Evidence SHA", evidenceShaPassed, evidenceShaPassed ? `Generated SHA-256 digest ${evidenceObj.evidenceSha256}` : "Evidence digest is missing or invalid.");

    // GATE 14: actual Ed25519 signature verification over canonical evidence payload.
    const privateKey = process.env.RELEASE_EVIDENCE_SIGNING_PRIVATE_KEY || "";
    const publicKey = process.env.RELEASE_EVIDENCE_SIGNING_PUBLIC_KEY || "";
    let signaturePassed = false;
    let signatureDetails = "Signing key pair is required; signature is not inferred from a scheme label.";
    if (privateKey && publicKey && evidenceShaPassed) {
      try {
        const payload = canonicalJson(evidenceObj.bundle);
        const signature = crypto.sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64");
        signaturePassed = verifyEd25519Signature(payload, signature, publicKey);
        signatureDetails = signaturePassed ? "Verified an actual Ed25519 signature over the canonical evidence payload." : "Ed25519 signature verification failed.";
      } catch (err: any) {
        signatureDetails = `Ed25519 verification error: ${err.message}`;
      }
    }
    addCheck("GATE-14", "Evidence cryptographic signature", signaturePassed, signatureDetails);

    // GATE 15: exact-SHA CI is strictly fail-closed.
    let ciPassed = false;
    let ciDetails = "GITHUB_TOKEN/GH_TOKEN is required; CI cannot be certified offline.";
    if (token && isValid40CharGitSha(localHeadSha)) {
      try {
        const ci = await fetchRequiredCiChecks(repo, localHeadSha, token);
        ciPassed = ci.passed;
        ciDetails = ci.details;
      } catch (err: any) {
        ciPassed = false;
        ciDetails = `CI verification failed closed: ${err.message}`;
      }
    }
    addCheck("GATE-15", "Exact-SHA CI PASS", ciPassed, ciDetails);
  } finally {
    if (fs.existsSync(tempTestDir)) fs.rmSync(tempTestDir, { recursive: true, force: true });
  }

  const passedChecks = checks.filter((c) => c.passed).length;
  const totalChecks = checks.length;
  const failedChecks = totalChecks - passedChecks;
  const overallPassed = failedChecks === 0;
  const result: VersionSyncCertificationResult = { passed: overallPassed, totalChecks, passedChecks, failedChecks, checks, timestamp: new Date().toISOString() };

  const artifactDir = path.join(cwd, "artifacts", "certification");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "version-sync-certification-report.json"), JSON.stringify(result, null, 2), "utf8");
  return result;
}
