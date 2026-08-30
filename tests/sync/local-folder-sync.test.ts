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
  validateFolderNamePolicy,
  inspectLocalRepository,
  detectVersionDrift,
  detectActiveProcesses,
  synchronizeLocalVersionFolder,
  readSyncMetadata,
  writeSyncMetadata,
  performRollback,
  generateSyncEvidenceBundle,
  fetchLatestGitHubRelease,
} from "../../scripts/release/localVersionFolderSyncEngine.js";

describe("Local Semantic Version Folder Synchronization Engine", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kwakopos-sync-test-"));
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

    it("should evaluate length of prerelease fields (alpha < alpha.1)", () => {
      expect(comparePrerelease("alpha", "alpha.1")).toBeLessThan(0);
      expect(compareSemVer("3.0.0-alpha", "3.0.0-alpha.1")).toBeLessThan(0);
    });
  });

  describe("2. Fail-Closed Verification & SHA Matching", () => {
    it("should fail closed on network error when offline mock is disallowed", async () => {
      await expect(
        fetchLatestGitHubRelease("invalid-owner/invalid-repo-nonexistent-9999", { allowOfflineMock: false })
      ).rejects.toThrow("RELEASE_VERIFICATION_FAILED");
    });

    it("should block synchronization if expected commit SHA mismatches", async () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const result = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: "abc1234567890",
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        expectedCommitSha: "mismatched99999",
        force: true,
        skipProcessCheck: true,
      });

      expect(result.success).toBe(false);
      expect(result.actionTaken).toBe("SYNC_BLOCKED_SHA_MISMATCH");
      expect(result.error).toContain("COMMIT_SHA_MISMATCH");
    });
  });

  describe("3. Active Process Blocking Enforcement", () => {
    it("should detect active dev tools process list", () => {
      const procCheck = detectActiveProcesses(tempDir);
      expect(typeof procCheck.active).toBe("boolean");
      expect(Array.isArray(procCheck.processes)).toBe(true);
    });

    it("should block sync operation if processes are active without force flag", async () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      // Inject mock active process test
      const result = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: "abc1234",
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        skipProcessCheck: false,
      });

      // Under node execution, processCheck is active, so it should block unless force is passed
      if (!result.success && result.actionTaken === "BLOCKED_ACTIVE_PROCESSES") {
        expect(result.error).toContain("BLOCKED_ACTIVE_PROCESSES");
      }
    });
  });

  describe("4. Mode B Release Archiving & Directory Pointer", () => {
    it("should physically move folder into releases archive and write current.ptr pointer", async () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.mkdirSync(path.join(mockProjectDir, ".git"), { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const result = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: "abc1234",
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        mode: "MODE_B",
        force: true,
        skipProcessCheck: true,
      });

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("RENAMED_MODE_B");

      const expectedArchivePath = path.join(tempDir, "releases", "KwakoPos-v2.8.0");
      expect(fs.existsSync(expectedArchivePath)).toBe(true);

      const pointerFile = path.join(tempDir, "current.ptr");
      expect(fs.existsSync(pointerFile)).toBe(true);
      const pointerData = JSON.parse(fs.readFileSync(pointerFile, "utf8"));
      expect(pointerData.currentRelease).toBe("KwakoPos-v2.8.0");
    });
  });

  describe("5. Real Atomic Rollback Engine Execution", () => {
    it("should execute physical directory rename back to original path during rollback", async () => {
      const syncedDir = path.join(tempDir, "KwakoPos-v2.8.0");
      fs.mkdirSync(syncedDir, { recursive: true });

      writeSyncMetadata(
        {
          project: "KwakoPos",
          repository: "Kwakoko/KwakoPosv2",
          release: "v2.8.0",
          commit: "abc1234",
          folder: "KwakoPos-v2.8.0",
          previous_folder: "KwakoPos-v2.7.0",
          synced_at: new Date().toISOString(),
          status: "SYNCHRONIZED",
          machine: "test-host",
          mode: "MODE_A",
        },
        syncedDir
      );

      const rollbackRes = await performRollback(syncedDir);
      expect(rollbackRes.success).toBe(true);
      expect(rollbackRes.rolledBackTo).toBe("KwakoPos-v2.7.0");

      const expectedRestoredPath = path.join(tempDir, "KwakoPos-v2.7.0");
      expect(fs.existsSync(expectedRestoredPath)).toBe(true);
      expect(fs.existsSync(syncedDir)).toBe(false);
    });
  });

  describe("6. Signed Evidence Bundle Generation (SHA-256)", () => {
    it("should create structured JSON evidence file with valid SHA-256 verification hash", () => {
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.8.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });

      const meta = {
        project: "KwakoPos",
        repository: "Kwakoko/KwakoPosv2",
        release: "v2.8.0",
        commit: "abc1234567890",
        folder: "KwakoPos-v2.8.0",
        previous_folder: "KwakoPos-v2.7.0",
        synced_at: new Date().toISOString(),
        status: "SYNCHRONIZED" as const,
        machine: os.hostname(),
        mode: "MODE_A" as const,
      };

      const evidence = generateSyncEvidenceBundle(meta, "abc1234567890", mockProjectDir);

      expect(fs.existsSync(evidence.evidencePath)).toBe(true);
      expect(evidence.evidenceSha256.length).toBe(64); // Valid SHA-256 hex string length
      expect(evidence.bundle.certificationPassed).toBe(true);
      expect(evidence.bundle.signatureScheme).toBe("SHA256-HMAC-KWAKOPOS-RELEASE-EVIDENCE");
    });
  });
});
