import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as os from "os";
import * as crypto from "crypto";

export type FolderSyncMode = "MODE_A" | "MODE_B_RELEASE_PROMOTION";
export type SyncStatusState = "SYNCHRONIZED" | "OUTDATED" | "AHEAD" | "DRIFTED" | "UNKNOWN" | "BLOCKED";
export type TransactionPhaseState = "PREPARED" | "LOCK_ACQUIRED" | "RENAMING" | "RENAMED" | "INTEGRITY_VERIFIED" | "METADATA_COMMITTED" | "EVIDENCE_COMMITTED" | "COMPLETED";

export interface SemVerComponents { raw: string; normalized: string; major: number; minor: number; patch: number; prerelease?: string; build?: string; }
export interface LocalRepoState { absolutePath: string; folderName: string; gitRoot: string; branch: string; commitSha: string; gitTag: string; isDirty: boolean; packageVersion: string; projectName: string; }
export interface GitHubReleaseInfo { repo: string; tag: string; version: string; commitSha: string; publishedAt: string; draft: boolean; prerelease: boolean; certified: boolean; htmlUrl: string; }
export interface SyncMetadata { project: string; repository: string; release: string; commit: string; folder: string; previous_folder: string; synced_at: string; status: SyncStatusState; machine: string; mode: FolderSyncMode; transactionPhase: TransactionPhaseState; }
export interface SyncOptions { cwd?: string; force?: boolean; dryRun?: boolean; mode?: FolderSyncMode; targetRepo?: string; mockRelease?: GitHubReleaseInfo; allowOfflineMock?: boolean; skipProcessCheck?: boolean; expectedCommitSha?: string; containerSourceSha?: string; }
export interface SyncResult { success: boolean; status: SyncStatusState; previousVersion: string; targetVersion: string; previousPath: string; targetPath: string; actionTaken: string; logs: string[]; evidencePath?: string; evidenceSha256?: string; localHeadSha?: string; githubResolvedCommitSha?: string; certifiedSha?: string; containerSourceSha?: string; error?: string; }
export interface ReleaseEvidenceBundle { githubReleaseTag: string; githubResolvedCommitSha: string; localHeadSha: string; certificationSha: string; containerSourceSha: string; syncedAt: string; machineHost: string; previousFolder: string; newFolder: string; certificationPassed: boolean; verificationSha: string; signatureScheme: string; }
export interface SyncLockPayload { lockId: string; pid: number; hostname: string; createdAt: string; heartbeatAt: string; repositoryPath: string; targetPath: string; phase: TransactionPhaseState; }

const GIT_SHA_40_REGEX = /^[0-9a-fA-F]{40}$/;
const LOCK_HEARTBEAT_TTL_MS = 30000;
const isProductionCertification = () => process.env.NODE_ENV === "production-certification";

export function assertValid40CharGitSha(sha: string): void {
  if (!sha || !GIT_SHA_40_REGEX.test(sha.trim())) throw new Error(`RELEASE_SHA_INVALID: "${sha}" is not a valid 40-character Git SHA.`);
}
export function isValid40CharGitSha(sha: string): boolean { return Boolean(sha && GIT_SHA_40_REGEX.test(sha.trim())); }

export async function resolvePeeledCommitSha(tag: string, repo = "Kwakoko/KwakoPosv2", options?: { token?: string; cwd?: string }): Promise<string> {
  const cwd = options?.cwd || process.cwd();
  const prodCert = isProductionCertification();

  if (!prodCert) {
    try {
      const peeledLocal = execSync(`git rev-parse ${tag}^{commit}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (isValid40CharGitSha(peeledLocal)) return peeledLocal;
    } catch {}
  }

  const token = options?.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "KwakoPos-FolderSyncEngine" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, { headers });
    if (!refRes.ok) throw new Error(`HTTP ${refRes.status} resolving GitHub tag ${tag}`);
    const refData: any = await refRes.json();
    const objSha = refData.object?.sha;
    const objType = refData.object?.type;
    if (objType === "commit" && isValid40CharGitSha(objSha)) return objSha;
    if (objType === "tag" && isValid40CharGitSha(objSha)) {
      const tagRes = await fetch(`https://api.github.com/repos/${repo}/git/tags/${objSha}`, { headers });
      if (!tagRes.ok) throw new Error(`HTTP ${tagRes.status} resolving annotated tag object ${objSha}`);
      const tagData: any = await tagRes.json();
      const commitSha = tagData.object?.sha;
      if (tagData.object?.type === "commit" && isValid40CharGitSha(commitSha)) return commitSha;
    }
    throw new Error(`GitHub tag ${tag} did not resolve to a commit object`);
  } catch (err: any) {
    if (prodCert) throw new Error(`RELEASE_SHA_INVALID: Authoritative GitHub tag resolution failed for ${tag}: ${err?.message || err}`);
    throw err;
  }
}

const SEMVER_REGEX = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
export function parseSemVer(versionStr: string): SemVerComponents {
  const trimmed = versionStr.trim(); const match = trimmed.match(SEMVER_REGEX);
  if (!match) throw new Error(`INVALID_SEMVER: "${versionStr}" is not a valid Semantic Version.`);
  const major = parseInt(match[1], 10), minor = parseInt(match[2], 10), patch = parseInt(match[3], 10);
  const prerelease = match[4] || undefined, build = match[5] || undefined;
  let normalized = `${major}.${minor}.${patch}`; if (prerelease) normalized += `-${prerelease}`;
  return { raw: trimmed, normalized, major, minor, patch, prerelease, build };
}
export function isValidSemVer(versionStr: string): boolean { return SEMVER_REGEX.test(versionStr.trim()); }
export function comparePrerelease(p1?: string, p2?: string): number {
  if (!p1 && !p2) return 0; if (!p1 && p2) return 1; if (p1 && !p2) return -1;
  const parts1 = p1!.split("."), parts2 = p2!.split("."), minLength = Math.min(parts1.length, parts2.length);
  for (let i = 0; i < minLength; i++) {
    const id1 = parts1[i], id2 = parts2[i]; if (id1 === id2) continue;
    const isNum1 = /^\d+$/.test(id1), isNum2 = /^\d+$/.test(id2);
    if (isNum1 && isNum2) { const diff = Number(id1) - Number(id2); if (diff) return diff; }
    else if (isNum1 && !isNum2) return -1; else if (!isNum1 && isNum2) return 1;
    else { const diff = id1.localeCompare(id2); if (diff) return diff; }
  }
  return parts1.length - parts2.length;
}
export function compareSemVer(v1: string, v2: string): number { const s1 = parseSemVer(v1), s2 = parseSemVer(v2); if (s1.major !== s2.major) return s1.major - s2.major; if (s1.minor !== s2.minor) return s1.minor - s2.minor; if (s1.patch !== s2.patch) return s1.patch - s2.patch; return comparePrerelease(s1.prerelease, s2.prerelease); }
export function getCanonicalFolderName(projectName: string, semverStr: string, options?: { includeBuild?: boolean }): string { const parsed = parseSemVer(semverStr); let versionTag = `v${parsed.normalized}`; if (options?.includeBuild && parsed.build) versionTag += `+${parsed.build}`; return `${projectName.replace(/[^a-zA-Z0-9_-]/g, "")}-${versionTag}`; }

export function inspectLocalRepository(targetCwd?: string): LocalRepoState {
  const cwd = path.resolve(targetCwd || process.cwd()), folderName = path.basename(cwd); let gitRoot = cwd, branch = "unknown", commitSha = "", gitTag = "";
  try { gitRoot = execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf8" }).trim(); } catch {}
  try { branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8" }).trim(); } catch { branch = "detached"; }
  try { commitSha = execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim(); } catch { commitSha = ""; }
  try { gitTag = execSync("git describe --tags --exact-match", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { try { gitTag = execSync("git describe --tags --abbrev=0", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {} }
  let isDirty = false, packageVersion = "", projectName = "KwakoPos";
  try { isDirty = execSync("git status --porcelain", { cwd, encoding: "utf8" }).trim().length > 0; } catch { isDirty = true; }
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) { try { const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")); if (pkg.version) packageVersion = pkg.version; if (pkg.name && pkg.name.toLowerCase().includes("kwako")) projectName = "KwakoPos"; } catch { packageVersion = ""; } }
  return { absolutePath: cwd, folderName, gitRoot, branch, commitSha, gitTag, isDirty, packageVersion, projectName };
}

export function verifyPostRenameGitIntegrity(renamedPath: string, expectedCommitSha: string): { valid: boolean; postRenameSha: string; reason: string } {
  const gitDir = path.join(renamedPath, ".git"); if (!fs.existsSync(gitDir)) return { valid: false, postRenameSha: "", reason: "Directory does not contain a .git directory after rename." };
  try {
    const isWorkTree = execSync("git rev-parse --is-inside-work-tree", { cwd: renamedPath, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (isWorkTree !== "true") return { valid: false, postRenameSha: "", reason: "Git repository integrity check did not confirm a work tree." };
    const postRenameSha = execSync("git rev-parse HEAD", { cwd: renamedPath, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    assertValid40CharGitSha(postRenameSha); assertValid40CharGitSha(expectedCommitSha);
    if (postRenameSha !== expectedCommitSha) return { valid: false, postRenameSha, reason: `Post-rename HEAD SHA (${postRenameSha}) does not match expected SHA (${expectedCommitSha}).` };
    try { execSync("git fsck --no-progress", { cwd: renamedPath, stdio: ["ignore", "ignore", "ignore"] }); } catch { return { valid: false, postRenameSha, reason: "git fsck failed after rename." }; }
    return { valid: true, postRenameSha, reason: "Git database, work tree, HEAD SHA, and object integrity verified post-rename." };
  } catch (err: any) { return { valid: false, postRenameSha: "", reason: `Git integrity verification failed: ${err?.message || err}` }; }
}

export async function fetchLatestGitHubRelease(targetRepo = "Kwakoko/KwakoPosv2", options?: { token?: string; mockRelease?: GitHubReleaseInfo; allowOfflineMock?: boolean }): Promise<GitHubReleaseInfo> {
  const prodCert = isProductionCertification();
  if (!prodCert && options?.mockRelease) { assertValid40CharGitSha(options.mockRelease.commitSha); return options.mockRelease; }
  const allowOffline = !prodCert && (options?.allowOfflineMock || process.env.SYNC_ALLOW_OFFLINE_MOCK === "true");
  const envMock = process.env.SYNC_OFFLINE_MOCK_RELEASE;
  if (allowOffline && envMock) { try { const parsed = JSON.parse(envMock); assertValid40CharGitSha(parsed.commitSha); return parsed; } catch {} }
  const token = options?.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "KwakoPos-FolderSyncEngine" }; if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`https://api.github.com/repos/${targetRepo}/releases/latest`, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching release for repository ${targetRepo}`);
    const rel: any = await response.json(); const rawTag = rel.tag_name;
    if (!rawTag || !isValidSemVer(rawTag) || rawTag !== `v${parseSemVer(rawTag).normalized}`) throw new Error(`INVALID_RELEASE_TAG:${rawTag || "missing"}`);
    const version = parseSemVer(rawTag).normalized;
    const commitSha = await resolvePeeledCommitSha(rawTag, targetRepo, { token }); assertValid40CharGitSha(commitSha);
    return { repo: targetRepo, tag: rawTag, version, commitSha, publishedAt: rel.published_at || "", draft: Boolean(rel.draft), prerelease: Boolean(rel.prerelease), certified: true, htmlUrl: rel.html_url || "" };
  } catch (err: any) {
    if (allowOffline) throw new Error(`OFFLINE_MOCK_REQUIRES_VALID_RELEASE: ${err?.message || err}`);
    throw new Error(`RELEASE_VERIFICATION_FAILED: Network/GitHub API unavailable to verify authoritative release for ${targetRepo}: ${err?.message || err}. Fail-open fallback disabled.`);
  }
}

export function detectVersionFromFolderName(folderName: string): string | null { const match = folderName.match(/v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-zA-Z.-]+)?(?:\+[0-9a-zA-Z.-]+)?$/); if (!match) return null; const raw = match[0]; return raw.startsWith("v") ? raw.slice(1) : raw; }
export function detectVersionDrift(localRepo: LocalRepoState, remoteRelease: GitHubReleaseInfo): { status: SyncStatusState; folderVersion: string; remoteVersion: string; reason: string } {
  const folderVersion = detectVersionFromFolderName(localRepo.folderName) || localRepo.packageVersion, remoteVersion = remoteRelease.version;
  if (!folderVersion || !isValidSemVer(folderVersion) || !isValidSemVer(remoteVersion)) return { status: "UNKNOWN", folderVersion, remoteVersion, reason: "Invalid or missing Semantic Version detected." };
  if (localRepo.isDirty) return { status: "BLOCKED", folderVersion, remoteVersion, reason: "Uncommitted changes present in local working tree." };
  const comp = compareSemVer(remoteVersion, folderVersion);
  if (comp === 0) { const expectedCanonical = getCanonicalFolderName(localRepo.projectName, remoteVersion); if (localRepo.folderName !== expectedCanonical) return { status: "DRIFTED", folderVersion, remoteVersion, reason: `Folder name "${localRepo.folderName}" does not match canonical name "${expectedCanonical}".` }; return { status: "SYNCHRONIZED", folderVersion, remoteVersion, reason: "Local project folder is synchronized with the authoritative release." }; }
  if (comp > 0) return { status: "OUTDATED", folderVersion, remoteVersion, reason: `Newer GitHub release v${remoteVersion} is available.` };
  return { status: "AHEAD", folderVersion, remoteVersion, reason: `Local folder v${folderVersion} is ahead of GitHub release v${remoteVersion}.` };
}

export function detectActiveProcesses(cwd: string): { active: boolean; processes: string[] } {
  const processes: string[] = [];
  try {
    if (process.platform === "win32") {
      const output = execSync("tasklist /FO CSV /NH", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const targetTools = ["code.exe", "node.exe", "vitest.exe", "playwright.exe", "antigravity.exe"];
      for (const line of output.split("\n")) { const parts = line.split('","'); if (parts.length > 0) { const name = parts[0].replace(/"/g, "").toLowerCase(); if (targetTools.some((tool) => name.includes(tool))) processes.push(name); } }
    } else {
      const output = execSync("ps aux", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); const normalized = path.resolve(cwd).toLowerCase();
      for (const line of output.split("\n")) if (line.toLowerCase().includes(normalized) && !line.includes("ps aux")) processes.push(line.trim().slice(0, 160));
    }
  } catch { return { active: true, processes: ["PROCESS_CHECK_UNAVAILABLE"] }; }
  return { active: processes.length > 0, processes: Array.from(new Set(processes)) };
}

export function getSyncMetadataPath(cwd: string): string { return path.join(cwd, ".kwakopos-sync.json"); }
export function readSyncMetadata(cwd: string): SyncMetadata | null { const p = getSyncMetadataPath(cwd); if (!fs.existsSync(p)) return null; try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
export function writeSyncMetadata(metadata: SyncMetadata, cwd: string): void { const p = getSyncMetadataPath(cwd); const tmp = `${p}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(metadata, null, 2), "utf8"); fs.renameSync(tmp, p); }

export function generateSyncEvidenceBundle(metadata: SyncMetadata, shas: { githubReleaseTag: string; githubResolvedCommitSha: string; localHeadSha: string; certificationSha: string; containerSourceSha: string }, cwd: string): { evidencePath: string; evidenceSha256: string; bundle: ReleaseEvidenceBundle } {
  if (!shas.githubReleaseTag || !shas.githubResolvedCommitSha || !shas.localHeadSha || !shas.certificationSha || !shas.containerSourceSha) throw new Error("EVIDENCE_CREATION_REFUSED: all five provenance fields are mandatory.");
  assertValid40CharGitSha(shas.githubResolvedCommitSha); assertValid40CharGitSha(shas.localHeadSha); assertValid40CharGitSha(shas.certificationSha); assertValid40CharGitSha(shas.containerSourceSha);
  if (shas.githubResolvedCommitSha !== shas.localHeadSha || shas.localHeadSha !== shas.certificationSha || shas.certificationSha !== shas.containerSourceSha) throw new Error("EVIDENCE_CREATION_REFUSED: provenance SHA identity mismatch.");
  const evidenceDir = path.join(cwd, "artifacts", "release-evidence"); fs.mkdirSync(evidenceDir, { recursive: true });
  const rawPayload = `${metadata.project}:${metadata.repository}:${shas.githubReleaseTag}:${shas.githubResolvedCommitSha}:${shas.localHeadSha}:${shas.certificationSha}:${shas.containerSourceSha}:${metadata.folder}:${metadata.previous_folder}:${metadata.synced_at}:${metadata.machine}`;
  const verificationSha = crypto.createHash("sha256").update(rawPayload).digest("hex");
  const bundle: ReleaseEvidenceBundle = { githubReleaseTag: shas.githubReleaseTag, githubResolvedCommitSha: shas.githubResolvedCommitSha, localHeadSha: shas.localHeadSha, certificationSha: shas.certificationSha, containerSourceSha: shas.containerSourceSha, syncedAt: metadata.synced_at, machineHost: metadata.machine, previousFolder: metadata.previous_folder, newFolder: metadata.folder, certificationPassed: true, verificationSha, signatureScheme: "SHA256-DIGEST-KWAKOPOS-RELEASE-EVIDENCE" };
  const evidencePath = path.join(evidenceDir, "kwakopos-folder-sync-evidence.json"); const tmp = `${evidencePath}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2), "utf8"); fs.renameSync(tmp, evidencePath); return { evidencePath, evidenceSha256: verificationSha, bundle };
}

export async function performRollback(cwd: string): Promise<{ success: boolean; rolledBackTo: string; logs: string[] }> {
  const logs: string[] = []; const log = (m: string) => { logs.push(`[${new Date().toISOString()}] ${m}`); };
  const metadata = readSyncMetadata(cwd); if (!metadata?.previous_folder) throw new Error("ROLLBACK_FAILED: No valid previous_folder metadata found.");
  const previousPath = path.join(path.dirname(cwd), metadata.previous_folder); if (fs.existsSync(previousPath) && previousPath !== cwd) throw new Error(`ROLLBACK_ABORTED: Previous directory ${previousPath} already exists.`);
  try { fs.renameSync(cwd, previousPath); const restored = { ...metadata, folder: metadata.previous_folder, previous_folder: metadata.folder, synced_at: new Date().toISOString(), status: "SYNCHRONIZED" as const, transactionPhase: "COMPLETED" as const }; writeSyncMetadata(restored, previousPath); log(`Rollback restored ${previousPath}`); return { success: true, rolledBackTo: metadata.previous_folder, logs }; } catch (err: any) { throw new Error(`ROLLBACK_EXECUTION_ERROR: ${err?.message || err}`); }
}

export function isProcessAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

export async function synchronizeLocalVersionFolder(options: SyncOptions = {}): Promise<SyncResult> {
  const logs: string[] = []; const log = (m: string) => { logs.push(`[${new Date().toISOString()}] ${m}`); console.log(`[SYNC_ENGINE] ${m}`); };
  const cwd = path.resolve(options.cwd || process.cwd()); const mode: FolderSyncMode = options.mode === "MODE_B" || (options.mode as any) === "MODE_B_RELEASE_PROMOTION" ? "MODE_B_RELEASE_PROMOTION" : "MODE_A";
  const localRepo = inspectLocalRepository(cwd); assertValid40CharGitSha(localRepo.commitSha); log(`Local HEAD SHA: ${localRepo.commitSha}`);
  const targetRepo = options.targetRepo || "Kwakoko/KwakoPosv2";
  const remoteRelease = await fetchLatestGitHubRelease(targetRepo, { mockRelease: options.mockRelease, allowOfflineMock: options.allowOfflineMock }); assertValid40CharGitSha(remoteRelease.commitSha);
  const targetExpectedSha = options.expectedCommitSha; const containerSha = options.containerSourceSha;
  assertValid40CharGitSha(targetExpectedSha || ""); assertValid40CharGitSha(containerSha || "");
  if (localRepo.commitSha !== remoteRelease.commitSha || remoteRelease.commitSha !== targetExpectedSha || targetExpectedSha !== containerSha) return { success: false, status: "BLOCKED", previousVersion: localRepo.packageVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath: cwd, actionTaken: "SYNC_BLOCKED_SHA_MISMATCH", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, error: "TRIPARTITE_SHA_MISMATCH: local, remote, certified, and container SHAs must all match." };

  const drift = detectVersionDrift(localRepo, remoteRelease); log(`Drift Status: ${drift.status}`);
  if (drift.status === "SYNCHRONIZED" && !options.force) return { success: true, status: "SYNCHRONIZED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath: cwd, actionTaken: "NONE (Already synchronized)", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs };
  if (localRepo.isDirty && !options.force) return { success: false, status: "BLOCKED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath: cwd, actionTaken: "SYNC_BLOCKED_DIRTY_TREE", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, error: "SYNC BLOCKED: Working tree contains uncommitted changes." };
  if (!options.skipProcessCheck && !options.force) { const pc = detectActiveProcesses(cwd); if (pc.active) return { success: false, status: "BLOCKED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath: cwd, actionTaken: "BLOCKED_ACTIVE_PROCESSES", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, error: `BLOCKED_ACTIVE_PROCESSES: ${pc.processes.slice(0, 3).join(", ")}` }; }

  const parentDir = path.dirname(cwd), canonicalName = getCanonicalFolderName(localRepo.projectName, remoteRelease.version); let targetPath = path.join(parentDir, canonicalName);
  if (mode === "MODE_B_RELEASE_PROMOTION") { const root = path.join(parentDir, "releases"); fs.mkdirSync(root, { recursive: true }); targetPath = path.join(root, canonicalName); }
  if (fs.existsSync(targetPath) && targetPath !== cwd) return { success: false, status: "BLOCKED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath, actionTaken: "SYNC_ABORTED_COLLISION", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, error: `TARGET DIRECTORY EXISTS: ${targetPath}` };
  if (options.dryRun) return { success: true, status: drift.status, previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath, actionTaken: "DRY_RUN_SUCCESS", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs };

  for (const file of fs.readdirSync(parentDir).filter((f) => f.startsWith(".kwakopos-sync-") && f.endsWith(".lock"))) {
    const p = path.join(parentDir, file); let data: SyncLockPayload;
    try { data = JSON.parse(fs.readFileSync(p, "utf8")); if (!data.lockId || !data.pid || !data.hostname || !data.heartbeatAt) throw new Error("malformed"); } catch { return { success: false, status: "BLOCKED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath, actionTaken: "SYNC_BLOCKED_MALFORMED_LOCK", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, error: `SYNC_BLOCKED_MALFORMED_LOCK: ${file}` }; }
    const sameHost = data.hostname === os.hostname(), pidAlive = sameHost ? isProcessAlive(data.pid) : true, age = Date.now() - new Date(data.heartbeatAt).getTime();
    if (pidAlive || !sameHost || age < LOCK_HEARTBEAT_TTL_MS) return { success: false, status: "BLOCKED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath, actionTaken: "SYNC_BLOCKED_CONCURRENCY_LOCK", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, error: `SYNC_BLOCKED_CONCURRENCY_LOCK: PID ${data.pid} host ${data.hostname}` };
    fs.unlinkSync(p);
  }

  const lockId = `LOCK-${crypto.randomBytes(6).toString("hex")}`, lockFile = path.join(parentDir, `.kwakopos-sync-${process.pid}-${Date.now()}.lock`), startedAt = new Date().toISOString();
  const writeLock = (phase: TransactionPhaseState) => { const payload: SyncLockPayload = { lockId, pid: process.pid, hostname: os.hostname(), createdAt: startedAt, heartbeatAt: new Date().toISOString(), repositoryPath: cwd, targetPath, phase }; fs.writeFileSync(lockFile, JSON.stringify(payload, null, 2), "utf8"); };
  try { const fd = fs.openSync(lockFile, "wx"); fs.closeSync(fd); writeLock("LOCK_ACQUIRED"); } catch (err: any) { if (err.code === "EEXIST") return { success: false, status: "BLOCKED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath, actionTaken: "SYNC_BLOCKED_CONCURRENCY_LOCK", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, error: "Atomic lock acquisition lost a concurrent race." }; throw err; }

  const heartbeatTimer = setInterval(() => { try { writeLock("LOCK_ACQUIRED"); } catch {} }, 5000);
  let transactionPhase: TransactionPhaseState = "LOCK_ACQUIRED";
  try {
    transactionPhase = "RENAMING"; writeLock(transactionPhase); fs.renameSync(cwd, targetPath); transactionPhase = "RENAMED"; writeLock(transactionPhase);
    const gitCheck = verifyPostRenameGitIntegrity(targetPath, localRepo.commitSha); if (!gitCheck.valid) throw new Error(gitCheck.reason); transactionPhase = "INTEGRITY_VERIFIED"; writeLock(transactionPhase);
    const metadata: SyncMetadata = { project: localRepo.projectName, repository: targetRepo, release: remoteRelease.tag, commit: remoteRelease.commitSha, folder: canonicalName, previous_folder: localRepo.folderName, synced_at: new Date().toISOString(), status: "SYNCHRONIZED", machine: os.hostname(), mode, transactionPhase: "METADATA_COMMITTED" };
    if (mode === "MODE_B_RELEASE_PROMOTION") { const pointerPath = path.join(parentDir, "current.ptr"); fs.writeFileSync(`${pointerPath}.tmp-${process.pid}`, JSON.stringify({ currentRelease: canonicalName, path: targetPath, updatedAt: new Date().toISOString() }, null, 2)); fs.renameSync(`${pointerPath}.tmp-${process.pid}`, pointerPath); }
    writeSyncMetadata(metadata, targetPath); transactionPhase = "METADATA_COMMITTED"; writeLock(transactionPhase);
    const evidence = generateSyncEvidenceBundle(metadata, { githubReleaseTag: remoteRelease.tag, githubResolvedCommitSha: remoteRelease.commitSha, localHeadSha: localRepo.commitSha, certificationSha: targetExpectedSha, containerSourceSha: containerSha }, targetPath); transactionPhase = "EVIDENCE_COMMITTED"; writeLock(transactionPhase); writeLock("COMPLETED"); clearInterval(heartbeatTimer); if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    return { success: true, status: "SYNCHRONIZED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath, actionTaken: `RENAMED_${mode}`, localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, evidencePath: evidence.evidencePath, evidenceSha256: evidence.evidenceSha256 };
  } catch (err: any) {
    clearInterval(heartbeatTimer); try { if (fs.existsSync(targetPath) && !fs.existsSync(cwd)) fs.renameSync(targetPath, cwd); } catch (rollbackErr: any) { log(`Rollback failure at phase ${transactionPhase}: ${rollbackErr.message}`); } if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    return { success: false, status: "BLOCKED", previousVersion: drift.folderVersion, targetVersion: remoteRelease.version, previousPath: cwd, targetPath, actionTaken: "RENAME_FAILED_ROLLED_BACK", localHeadSha: localRepo.commitSha, githubResolvedCommitSha: remoteRelease.commitSha, certifiedSha: targetExpectedSha, containerSourceSha: containerSha, logs, error: err?.message || "Synchronization failed." };
  }
}
