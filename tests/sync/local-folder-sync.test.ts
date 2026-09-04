import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  parseSemVer,
  isValidSemVer,
  compareSemVer,
  comparePrerelease,
  getCanonicalFolderName,
  inspectLocalRepository,
  detectActiveProcesses,
  synchronizeLocalVersionFolder,
  readSyncMetadata,
  writeSyncMetadata,
  performRollback,
  generateSyncEvidenceBundle,
  fetchLatestGitHubRelease,
  assertValid40CharGitSha,
  isValid40CharGitSha,
  verifyPostRenameGitIntegrity,
  detectVersionFromFolderName,
  isProcessAlive,
} from "../../scripts/release/localVersionFolderSyncEngine.js";

describe("Local Semantic Version Folder Synchronization Engine (15-Gate Integrity)", () => {
  let tempDir: string;
  const valid40CharSha = "2b65e64e96c6c3497271aea1125fe2ec0a969df5";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kwakopos-sync-test-15-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("1. True SemVer 2.0.0 Prerelease Comparison Algorithm", () => {
    it("should correctly handle standard SemVer parsing", () => {
      const v = parseSemVer("v2.5.0");
      expect(v.major).toBe(2);
      expect(v.minor).toBe(5);
      expect(v.patch).toBe(0);
      expect(v.normalized).toBe("2.5.0");
    });

    it("should evaluate numeric prerelease parts numerically (beta.2 < beta.11)", () => {
      expect(comparePrerelease("beta.2", "beta.11")).toBeLessThan(0);
      expect(comparePrerelease("beta.11", "beta.2")).toBeGreaterThan(0);
      expect(compareSemVer("3.0.0-beta.2", "3.0.0-beta.11")).toBeLessThan(0);
      expect(compareSemVer("3.0.0-beta.11", "3.0.0-beta.2")).toBeGreaterThan(0);
    });

    it("should evaluate prerelease vs normal version precedence (rc.1 < 1.0.0)", () => {
      expect(compareSemVer("3.0.0-rc.1", "3.0.0")).toBeLessThan(0);
      expect(compareSemVer("3.0.0", "3.0.0-rc.1")).toBeGreaterThan(0);
    });

    it("should evaluate alphanumeric precedence correctly (alpha < beta < rc)", () => {
      expect(compareSemVer("3.0.0-alpha.1", "3.0.0-beta.1")).toBeLessThan(0);
      expect(compareSemVer("3.0.0-beta.1", "3.0.0-rc.1")).toBeLessThan(0);
    });

    it("should correctly detect versions with build metadata and prereleases from folder names", () => {
      expect(detectVersionFromFolderName("KwakoPos-v2.0.0")).toBe("2.0.0");
      expect(detectVersionFromFolderName("KwakoPos-v2.12.5-rc.1")).toBe("2.12.5-rc.1");
      expect(detectVersionFromFolderName("KwakoPos-v2.0.0+build.123")).toBe("2.0.0+build.123");
      expect(detectVersionFromFolderName("KwakoPos-v2.0.0-beta.1+exp.sha.5114f85")).toBe("2.0.0-beta.1+exp.sha.5114f85");
    });
  });

  describe("2. Strict 40-Character SHA Resolution & Rejection of Abbreviated SHAs", () => {
    it("should validate strict 40-character hex Git SHAs and reject abbreviated SHAs", () => {
      expect(isValid40CharGitSha(valid40CharSha)).toBe(true);
      expect(isValid40CharGitSha("d8bac86")).toBe(false); // Abbreviated SHA rejected!
      expect(isValid40CharGitSha("main")).toBe(false);
      expect(() => assertValid40CharGitSha("d8bac86")).toThrow("RELEASE_SHA_INVALID");
    });

    it("should fail closed on network error when offline mock is disallowed", async () => {
      await expect(
        fetchLatestGitHubRelease("invalid-owner/invalid-repo-nonexistent-9999", { allowOfflineMock: false })
      ).rejects.toThrow("RELEASE_VERIFICATION_FAILED");
    });

    it("should block synchronization if SHA mismatch occurs", async () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const result = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: valid40CharSha,
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        expectedCommitSha: "1111111111111111111111111111111111111111",
        force: true,
        skipProcessCheck: true,
      });

      expect(result.success).toBe(false);
      expect(result.actionTaken).toBe("SYNC_BLOCKED_SHA_MISMATCH");
      expect(result.error).toContain("TRIPARTITE_SHA_MISMATCH");
    });
  });

  describe("3. Active Process Blocking Enforcement", () => {
    it("should detect active dev tools process list", () => {
      const procCheck = detectActiveProcesses(tempDir);
      expect(typeof procCheck.active).toBe("boolean");
      expect(Array.isArray(procCheck.processes)).toBe(true);
    });

    it("should correctly identify current PID as alive", () => {
      expect(isProcessAlive(process.pid)).toBe(true);
      expect(isProcessAlive(99999999)).toBe(false);
    });
  });

  describe("4. Mode B Release Promotion & Directory Pointer", () => {
    it("should physically move folder into releases archive and write current.ptr pointer", async () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.mkdirSync(path.join(mockProjectDir, ".git"), { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const localHead = inspectLocalRepository(mockProjectDir).commitSha;
      const targetSha = isValid40CharGitSha(localHead) ? localHead : valid40CharSha;

      const result = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: targetSha,
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        expectedCommitSha: targetSha,
        containerSourceSha: targetSha,
        mode: "MODE_B_RELEASE_PROMOTION",
        force: true,
        skipProcessCheck: true,
      });

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("RENAMED_MODE_B_RELEASE_PROMOTION");

      const expectedArchivePath = path.join(tempDir, "releases", "KwakoPos-v2.8.0");
      expect(fs.existsSync(expectedArchivePath)).toBe(true);

      const pointerFile = path.join(tempDir, "current.ptr");
      expect(fs.existsSync(pointerFile)).toBe(true);
      const pointerData = JSON.parse(fs.readFileSync(pointerFile, "utf8"));
      expect(pointerData.currentRelease).toBe("KwakoPos-v2.8.0");
    });

    it("should atomically roll back Mode B promotion folder back to project root and update pointer", async () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.mkdirSync(path.join(mockProjectDir, ".git"), { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const localHead = inspectLocalRepository(mockProjectDir).commitSha;
      const targetSha = isValid40CharGitSha(localHead) ? localHead : valid40CharSha;

      const syncRes = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: targetSha,
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        expectedCommitSha: targetSha,
        containerSourceSha: targetSha,
        mode: "MODE_B_RELEASE_PROMOTION",
        force: true,
        skipProcessCheck: true,
      });

      expect(syncRes.success).toBe(true);
      const promotedDir = syncRes.targetPath;
      expect(fs.existsSync(promotedDir)).toBe(true);

      const rollbackRes = await performRollback(promotedDir);
      expect(rollbackRes.success).toBe(true);
      expect(rollbackRes.rolledBackTo).toBe("KwakoPos-v2.7.0");

      // Verify folder was restored to root parent (tempDir), NOT left inside tempDir/releases
      const restoredPath = path.join(tempDir, "KwakoPos-v2.7.0");
      expect(fs.existsSync(restoredPath)).toBe(true);
      expect(fs.existsSync(promotedDir)).toBe(false);

      const pointerFile = path.join(tempDir, "current.ptr");
      expect(fs.existsSync(pointerFile)).toBe(true);
      const pointerData = JSON.parse(fs.readFileSync(pointerFile, "utf8"));
      expect(pointerData.currentRelease).toBe("KwakoPos-v2.7.0");
    });
  });

  describe("5. 6-Field Independent Evidence Proof (SHA-256 & Ed25519)", () => {
    it("should require matching all 6 fields (githubReleaseTag, githubResolvedCommitSha, localHeadSha, certificationSha, buildSourceSha, containerSourceSha, candidateSourceSha)", () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.8.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });

      const meta = {
        project: "KwakoPos",
        repository: "Kwakoko/KwakoPosv2",
        release: "v2.8.0",
        commit: valid40CharSha,
        folder: "KwakoPos-v2.8.0",
        previous_folder: "KwakoPos-v2.7.0",
        synced_at: new Date().toISOString(),
        status: "SYNCHRONIZED" as const,
        machine: os.hostname(),
        mode: "MODE_A" as const,
        transactionPhase: "COMPLETED" as const,
      };

      const shas = {
        githubReleaseTag: "v2.8.0",
        githubResolvedCommitSha: valid40CharSha,
        localHeadSha: valid40CharSha,
        certificationSha: valid40CharSha,
        buildSourceSha: valid40CharSha,
        containerSourceSha: valid40CharSha,
        candidateSourceSha: valid40CharSha,
      };

      const evidence = generateSyncEvidenceBundle(meta, shas, mockProjectDir);

      expect(fs.existsSync(evidence.evidencePath)).toBe(true);
      expect(evidence.evidenceSha256.length).toBe(64);
      expect(evidence.bundle.githubReleaseTag).toBe("v2.8.0");
      expect(evidence.bundle.githubResolvedCommitSha).toBe(valid40CharSha);
      expect(evidence.bundle.localHeadSha).toBe(valid40CharSha);
      expect(evidence.bundle.certificationSha).toBe(valid40CharSha);
      expect(evidence.bundle.buildSourceSha).toBe(valid40CharSha);
      expect(evidence.bundle.containerSourceSha).toBe(valid40CharSha);
      expect(evidence.bundle.candidateSourceSha).toBe(valid40CharSha);
      expect(evidence.bundle.signatureScheme).toBe("SHA256-ED25519-KWAKOPOS-RELEASE-EVIDENCE");
    });

    it("should refuse evidence creation if any SHA field mismatches or is missing", () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.8.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });

      const meta = {
        project: "KwakoPos",
        repository: "Kwakoko/KwakoPosv2",
        release: "v2.8.0",
        commit: valid40CharSha,
        folder: "KwakoPos-v2.8.0",
        previous_folder: "KwakoPos-v2.7.0",
        synced_at: new Date().toISOString(),
        status: "SYNCHRONIZED" as const,
        machine: os.hostname(),
        mode: "MODE_A" as const,
        transactionPhase: "COMPLETED" as const,
      };

      const mismatchedShas = {
        githubReleaseTag: "v2.8.0",
        githubResolvedCommitSha: valid40CharSha,
        localHeadSha: "1111111111111111111111111111111111111111",
        certificationSha: valid40CharSha,
        containerSourceSha: valid40CharSha,
      };

      expect(() => generateSyncEvidenceBundle(meta, mismatchedShas, mockProjectDir)).toThrow("EVIDENCE_CREATION_REFUSED");
    });
  });

  describe("6. Ownership-Aware Concurrency Locks & Malformed Lock Fail-Closed Policy", () => {
    it("should block sync attempt if active lock held by current PID with fresh heartbeat and valid lockId", async () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const localHeadSha = inspectLocalRepository(mockProjectDir).commitSha;

      const activeLockPath = path.join(tempDir, `.kwakopos-sync-${Date.now()}.lock`);
      const fd = fs.openSync(activeLockPath, "wx");
      fs.writeFileSync(
        fd,
        JSON.stringify({ lockId: "LOCK-TEST-001", pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), repositoryPath: mockProjectDir, targetPath: path.join(tempDir, "KwakoPos-v2.8.0"), phase: "RENAMING" }),
        "utf8"
      );
      fs.closeSync(fd);

      const result = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: localHeadSha,
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        expectedCommitSha: localHeadSha,
        containerSourceSha: localHeadSha,
        force: true,
        skipProcessCheck: true,
      });

      expect(result.success).toBe(false);
      expect(result.actionTaken).toBe("SYNC_BLOCKED_CONCURRENCY_LOCK");
    });

    it("should fail closed without deleting malformed lock files", async () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const localHeadSha = inspectLocalRepository(mockProjectDir).commitSha;

      const malformedLockPath = path.join(tempDir, `.kwakopos-sync-${Date.now()}.lock`);
      const fd = fs.openSync(malformedLockPath, "wx");
      fs.writeFileSync(fd, "CORRUPT_JSON_DATA_PAYLOAD{{{", "utf8");
      fs.closeSync(fd);

      const result = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: localHeadSha,
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        expectedCommitSha: localHeadSha,
        containerSourceSha: localHeadSha,
        force: true,
        skipProcessCheck: true,
      });

      expect(result.success).toBe(false);
      expect(result.actionTaken).toBe("SYNC_BLOCKED_MALFORMED_LOCK");
      expect(fs.existsSync(malformedLockPath)).toBe(true); // Malformed lock file safely preserved!
    });
  });

  describe("7. Post-Rename Git Database Integrity Verification", () => {
    it("should verify post-rename working tree and HEAD SHA equality", () => {
      const cwd = process.cwd();
      const currentSha = inspectLocalRepository(cwd).commitSha;
      const res = verifyPostRenameGitIntegrity(cwd, currentSha);

      expect(res.valid).toBe(true);
      expect(res.postRenameSha).toBe(currentSha);
    });
  });
});
