import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { execSync } from "child_process";
import { spawnSync } from "child_process";
import {
  inspectLocalRepository,
  synchronizeLocalVersionFolder,
  writeSyncMetadata,
  performRollback,
  fetchLatestGitHubRelease,
  isValid40CharGitSha,
  generateSyncEvidenceBundle,
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

function getRequiredCiChecks(): string[] {
  const configured = (process.env.KWAKOPOS_REQUIRED_CI_CHECKS || "Build, Audit, and Test Suite")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return configured.length ? configured : ["Build, Audit, and Test Suite"];
}

function canonicalJson(value: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return JSON.stringify(sorted);
}

function verifyEd25519Signature(payload: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(payload, "utf8"), publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

function runAtomicTwoProcessRace(lockPath: string): { oneWon: boolean; oneLost: boolean } {
  const child = `
    const fs = require("fs");
    try { const fd = fs.openSync(process.argv[1], "wx"); fs.closeSync(fd); process.exit(0); }
    catch (e) { process.exit(e && e.code === "EEXIST" ? 17 : 19); }
  `;
  const a = spawnSync(process.execPath, ["-e", child, lockPath], { encoding: "utf8" });
  const b = spawnSync(process.execPath, ["-e", child, lockPath], { encoding: "utf8" });
  const statuses = [a.status, b.status];
  return { oneWon: statuses.filter((s) => s === 0).length === 1, oneLost: statuses.filter((s) => s === 17).length === 1 };
}

function initializeGitFixture(dir: string, version: string): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "KwakoPos", version }), "utf8");
  try {
    execSync("git init -q", { cwd: dir, stdio: "ignore" });
    execSync("git config user.email 'certification@kwakopos.local'", { cwd: dir, stdio: "ignore" });
    execSync("git config user.name 'KwakoPos Certification'", { cwd: dir, stdio: "ignore" });
    execSync("git add package.json", { cwd: dir, stdio: "ignore" });
    execSync("git commit -qm 'certification fixture'", { cwd: dir, stdio: "ignore" });
  } catch {
    throw new Error(`CERTIFICATION_FIXTURE_GIT_INIT_FAILED:${dir}`);
  }
  return inspectLocalRepository(dir).commitSha;
}

async function fetchAuthoritativeGithubSha(tag: string, repo: string, token?: string): Promise<string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "KwakoPos-Production-Certification" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, { headers });
  if (!refRes.ok) throw new Error(`GITHUB_TAG_REF_FAILED:${refRes.status}`);
  const refData: any = await refRes.json();
  const objSha = refData.object?.sha;
  const objType = refData.object?.type;
  if (objType === "commit" && isValid40CharGitSha(objSha)) return objSha;
  if (objType !== "tag" || !isValid40CharGitSha(objSha)) throw new Error("GITHUB_TAG_OBJECT_INVALID");
  const tagRes = await fetch(`https://api.github.com/repos/${repo}/git/tags/${objSha}`, { headers });
  if (!tagRes.ok) throw new Error(`GITHUB_ANNOTATED_TAG_FAILED:${tagRes.status}`);
  const tagData: any = await tagRes.json();
  const peeled = tagData.object?.sha;
  if (tagData.object?.type !== "commit" || !isValid40CharGitSha(peeled)) throw new Error("GITHUB_PEELED_COMMIT_INVALID");
  return peeled;
}

async function fetchRequiredCiChecks(repo: string, sha: string, token: string): Promise<{ passed: boolean; details: string }> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "KwakoPos-Production-Certification" };
  const response = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`, { headers });
  if (!response.ok) throw new Error(`CI_CHECKS_API_FAILED:${response.status}`);
  const data: any = await response.json();
  if (!Array.isArray(data.check_runs) || data.check_runs.length === 0) return { passed: false, details: "No check-runs were returned for the exact certification SHA." };
  const byName = new Map<string, any>();
  for (const run of data.check_runs) byName.set(String(run.name).toLowerCase(), run);
  const requiredChecks = getRequiredCiChecks();
  const missing: string[] = [];
  const failed: string[] = [];
  for (const required of requiredChecks) {
    const run = byName.get(required.toLowerCase());
    if (!run) missing.push(required);
    else if (run.status !== "completed" || run.conclusion !== "success") failed.push(`${required}:${run.status}/${run.conclusion}`);
  }
  if (missing.length || failed.length) return { passed: false, details: `Required=${requiredChecks.join(",")}; Missing=${missing.join(",") || "none"}; FailedOrIncomplete=${failed.join(",") || "none"}` };
  return { passed: true, details: `All required CI checks passed for exact SHA ${sha}: ${requiredChecks.join(", ")}` };
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
  const originalNodeEnv = process.env.NODE_ENV;
  const tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), "cert-sync-prod-"));

  try {
    // GATE 1: real GitHub release only. Production certification never enables mocks.
    let relTag = "";
    let releaseVersion = "";
    try {
      const rel = await fetchLatestGitHubRelease(repo);
      relTag = rel.tag;
      releaseVersion = rel.version;
      addCheck("GATE-01", "GitHub Release exists", Boolean(rel.tag && rel.version && rel.certified), `Verified real release: tag=${rel.tag}, version=${rel.version}`);
    } catch (err: any) {
      addCheck("GATE-01", "GitHub Release exists", false, `Real GitHub release verification failed: ${err.message}`);
    }

    const tagResolved = Boolean(relTag && /^v\d+\.\d+\.\d+/.test(relTag));
    addCheck("GATE-02", "Release tag resolved", tagResolved, tagResolved ? `Authoritative tag=${relTag}` : "No valid authoritative release tag.");

    let peeledSha = "";
    try {
      peeledSha = await fetchAuthoritativeGithubSha(relTag, repo, token);
      addCheck("GATE-03", "Tag peeled to immutable 40-char SHA", isValid40CharGitSha(peeledSha), `GitHub tag ${relTag} resolves to ${peeledSha}`);
    } catch (err: any) {
      addCheck("GATE-03", "Tag peeled to immutable 40-char SHA", false, err.message);
    }

    const localHeadSha = localRepo.commitSha;
    addCheck("GATE-04", "Local HEAD SHA captured", isValid40CharGitSha(localHeadSha), `Local HEAD=${localHeadSha}`);

    const certificationSha = (process.env.CERTIFICATION_SHA || "").trim();
    const certShaPassed = isValid40CharGitSha(certificationSha);
    addCheck("GATE-05", "Certification SHA independently captured", certShaPassed, certShaPassed ? `CERTIFICATION_SHA=${certificationSha}` : "CERTIFICATION_SHA is missing or invalid; local HEAD fallback is forbidden.");

    const containerSourceSha = (process.env.CONTAINER_SOURCE_SHA || "").trim();
    const containerShaPassed = isValid40CharGitSha(containerSourceSha);
    addCheck("GATE-06", "Container source SHA independently captured", containerShaPassed, containerShaPassed ? `CONTAINER_SOURCE_SHA=${containerSourceSha}` : "CONTAINER_SOURCE_SHA is missing or invalid; local HEAD fallback is forbidden.");

    const allShasMatch = isValid40CharGitSha(peeledSha) && isValid40CharGitSha(localHeadSha) && certShaPassed && containerShaPassed && peeledSha === localHeadSha && localHeadSha === certificationSha && certificationSha === containerSourceSha;
    addCheck("GATE-07", "ALL independent SHAs identical", allShasMatch, `GitHub=${peeledSha || "missing"}; Local=${localHeadSha}; Certification=${certificationSha || "missing"}; Container=${containerSourceSha || "missing"}`);

    // Gates 8-12 are isolated synthetic safety tests. They cannot satisfy or replace gates 1-7, 13-15.
    process.env.NODE_ENV = "test";
    const raceLock = path.join(tempTestDir, ".kwakopos-two-process-race.lock");
    const race = runAtomicTwoProcessRace(raceLock);
    addCheck("GATE-08", "Two-process atomic lock race", race.oneWon && race.oneLost, race.oneWon && race.oneLost ? "Exactly one process acquired the exclusive lock and exactly one received EEXIST." : "Two-process exclusive-lock invariant failed.");

    const heartbeatDir = path.join(tempTestDir, "heartbeat-worktree");
    const heartbeatSha = initializeGitFixture(heartbeatDir, "9.0.0");
    const heartbeatLock = path.join(tempTestDir, `.kwakopos-sync-heartbeat-${Date.now()}.lock`);
    const activeFd = fs.openSync(heartbeatLock, "wx");
    fs.writeFileSync(activeFd, JSON.stringify({ lockId: "HEARTBEAT-ACTIVE", pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), repositoryPath: heartbeatDir, targetPath: path.join(tempTestDir, "target-active"), phase: "RENAMING" }), "utf8");
    fs.closeSync(activeFd);
    const activeResult = await synchronizeLocalVersionFolder({ cwd: heartbeatDir, force: true, skipProcessCheck: true, expectedCommitSha: heartbeatSha, containerSourceSha: heartbeatSha });
    const activeBlocked = !activeResult.success && activeResult.actionTaken === "SYNC_BLOCKED_CONCURRENCY_LOCK";
    if (fs.existsSync(heartbeatLock)) fs.unlinkSync(heartbeatLock);

    const staleLock = path.join(tempTestDir, `.kwakopos-sync-stale-${Date.now()}.lock`);
    const staleFd = fs.openSync(staleLock, "wx");
    fs.writeFileSync(staleFd, JSON.stringify({ lockId: "HEARTBEAT-STALE", pid: 999999, hostname: os.hostname(), createdAt: new Date(Date.now() - 120000).toISOString(), heartbeatAt: new Date(Date.now() - 120000).toISOString(), repositoryPath: heartbeatDir, targetPath: path.join(tempTestDir, "target-stale"), phase: "PREPARED" }), "utf8");
    fs.closeSync(staleFd);
    const staleResult = await synchronizeLocalVersionFolder({ cwd: heartbeatDir, force: true, skipProcessCheck: true, mockRelease: { repo, tag: "v9.0.1", version: "9.0.1", commitSha: heartbeatSha, publishedAt: new Date().toISOString(), draft: false, prerelease: false, certified: true, htmlUrl: "" }, expectedCommitSha: heartbeatSha, containerSourceSha: heartbeatSha });
    const staleRecovered = staleResult.success;
    addCheck("GATE-09", "Heartbeat and ownership test", activeBlocked && staleRecovered, `Active owner blocked=${activeBlocked}; dead-owner stale recovery=${staleRecovered}`);

    const crashRecoveryPassed = staleRecovered && fs.existsSync(path.join(tempTestDir, "KwakoPos-v9.0.1"));
    addCheck("GATE-10", "Crash recovery test", crashRecoveryPassed, crashRecoveryPassed ? "Recovered from dead-PID stale lock and completed the fixture synchronization." : "Stale-lock recovery did not complete deterministically.");

    const renameStart = path.join(tempTestDir, "KwakoPos-v9.1.0");
    const fixtureSha = initializeGitFixture(renameStart, "9.1.0");
    const renameResult = await synchronizeLocalVersionFolder({ cwd: renameStart, force: true, skipProcessCheck: true, mockRelease: { repo, tag: "v9.2.0", version: "9.2.0", commitSha: fixtureSha, publishedAt: new Date().toISOString(), draft: false, prerelease: false, certified: true, htmlUrl: "" }, expectedCommitSha: fixtureSha, containerSourceSha: fixtureSha });
    const renamePassed = renameResult.success && fs.existsSync(path.join(tempTestDir, "KwakoPos-v9.2.0"));
    addCheck("GATE-11", "Real rename execution", renamePassed, renamePassed ? "Physical rename completed in isolated fixture." : `Physical rename failed: ${renameResult.error || renameResult.actionTaken}`);

    const rollbackPath = path.join(tempTestDir, "KwakoPos-v9.2.0");
    if (fs.existsSync(rollbackPath)) writeSyncMetadata({ project: "KwakoPos", repository: repo, release: "v9.2.0", commit: fixtureSha, folder: "KwakoPos-v9.2.0", previous_folder: "KwakoPos-v9.1.0", synced_at: new Date().toISOString(), status: "SYNCHRONIZED", machine: os.hostname(), mode: "MODE_A", transactionPhase: "COMPLETED" }, rollbackPath);
    const rollbackResult = fs.existsSync(rollbackPath) ? await performRollback(rollbackPath) : { success: false, rolledBackTo: "" } as any;
    const rollbackPassed = rollbackResult.success && fs.existsSync(path.join(tempTestDir, "KwakoPos-v9.1.0"));
    addCheck("GATE-12", "Real rollback execution", rollbackPassed, rollbackPassed ? `Rollback restored ${rollbackResult.rolledBackTo}` : "Physical rollback failed.");

    process.env.NODE_ENV = originalNodeEnv;

    let evidenceShaPassed = false;
    let evidenceObj: any = null;
    try {
      evidenceObj = generateSyncEvidenceBundle(
        { project: "KwakoPos", repository: repo, release: relTag || "UNRESOLVED", commit: localHeadSha, folder: `KwakoPos-${releaseVersion || "UNRESOLVED"}`, previous_folder: "", synced_at: new Date().toISOString(), status: "SYNCHRONIZED", machine: os.hostname(), mode: "MODE_A", transactionPhase: "COMPLETED" },
        { githubReleaseTag: relTag, githubResolvedCommitSha: peeledSha, localHeadSha, certificationSha, containerSourceSha },
        cwd,
      );
      evidenceShaPassed = Boolean(evidenceObj.evidenceSha256 && /^[0-9a-f]{64}$/i.test(evidenceObj.evidenceSha256));
    } catch (err: any) {
      addCheck("GATE-13", "Evidence SHA", false, `Evidence creation refused: ${err.message}`);
    }
    if (evidenceObj) addCheck("GATE-13", "Evidence SHA", evidenceShaPassed, evidenceShaPassed ? `Generated SHA-256 digest ${evidenceObj.evidenceSha256}` : "Evidence digest is missing or invalid.");

    const privateKey = process.env.RELEASE_EVIDENCE_SIGNING_PRIVATE_KEY || "";
    const publicKey = process.env.RELEASE_EVIDENCE_SIGNING_PUBLIC_KEY || "";
    let signaturePassed = false;
    let signatureDetails = "Both Ed25519 signing and verification keys are required; a scheme label is never accepted as proof.";
    if (privateKey && publicKey && evidenceObj && evidenceShaPassed) {
      try {
        const payload = canonicalJson(evidenceObj.bundle as Record<string, unknown>);
        const signature = crypto.sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64");
        signaturePassed = verifyEd25519Signature(payload, signature, publicKey);
        signatureDetails = signaturePassed ? "Verified an actual Ed25519 signature over the canonical evidence payload." : "Ed25519 signature verification failed.";
      } catch (err: any) {
        signatureDetails = `Ed25519 verification error: ${err.message}`;
      }
    }
    addCheck("GATE-14", "Evidence cryptographic signature", signaturePassed, signatureDetails);

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
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
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
