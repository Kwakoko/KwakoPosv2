import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  parseSemVer,
  isValidSemVer,
  compareSemVer,
  getCanonicalFolderName,
  validateFolderNamePolicy,
  inspectLocalRepository,
  detectVersionDrift,
  detectActiveProcesses,
  synchronizeLocalVersionFolder,
  readSyncMetadata,
  writeSyncMetadata,
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

  describe("SemVer Utilities & Normalization", () => {
    it("should correctly parse standard SemVer strings", () => {
      const v = parseSemVer("v2.5.0");
      expect(v.major).toBe(2);
      expect(v.minor).toBe(5);
      expect(v.patch).toBe(0);
      expect(v.normalized).toBe("2.5.0");
    });

    it("should correctly parse prerelease and build metadata", () => {
      const v1 = parseSemVer("3.0.0-rc.1");
      expect(v1.prerelease).toBe("rc.1");

      const v2 = parseSemVer("3.0.0+build.20260830");
      expect(v2.build).toBe("build.20260830");
    });

    it("should validate and compare SemVer strings", () => {
      expect(isValidSemVer("2.4.0")).toBe(true);
      expect(isValidSemVer("invalid-ver")).toBe(false);
      expect(compareSemVer("2.8.0", "2.7.0")).toBeGreaterThan(0);
      expect(compareSemVer("2.7.0", "2.8.0")).toBeLessThan(0);
      expect(compareSemVer("2.7.0", "2.7.0")).toBe(0);
    });
  });

  describe("Canonical Folder Naming Policy", () => {
    it("should generate canonical folder names deterministically", () => {
      const name1 = getCanonicalFolderName("KwakoPos", "2.8.0");
      expect(name1).toBe("KwakoPos-v2.8.0");

      const name2 = getCanonicalFolderName("KwakoPos", "3.0.0-rc.1");
      expect(name2).toBe("KwakoPos-v3.0.0-rc.1");
    });

    it("should reject non-SemVer folder names according to policy", () => {
      expect(validateFolderNamePolicy("KwakoPos-v2.8.0", "KwakoPos")).toBe(true);
      expect(validateFolderNamePolicy("KwakoPos-final", "KwakoPos")).toBe(false);
      expect(validateFolderNamePolicy("KwakoPos-latest", "KwakoPos")).toBe(false);
    });
  });

  describe("Version Drift Detection", () => {
    it("should detect SYNCHRONIZED state when versions match", () => {
      const localRepo = {
        absolutePath: "/projects/KwakoPos-v2.8.0",
        folderName: "KwakoPos-v2.8.0",
        gitRoot: "/projects/KwakoPos-v2.8.0",
        branch: "main",
        commitSha: "abc1234",
        gitTag: "v2.8.0",
        isDirty: false,
        packageVersion: "2.8.0",
        projectName: "KwakoPos",
      };
      const remoteRelease = {
        repo: "Kwakoko/KwakoPosv2",
        tag: "v2.8.0",
        version: "2.8.0",
        commitSha: "abc1234",
        publishedAt: new Date().toISOString(),
        draft: false,
        prerelease: false,
        certified: true,
        htmlUrl: "",
      };

      const drift = detectVersionDrift(localRepo, remoteRelease);
      expect(drift.status).toBe("SYNCHRONIZED");
    });

    it("should detect OUTDATED state when remote version is newer", () => {
      const localRepo = {
        absolutePath: "/projects/KwakoPos-v2.7.0",
        folderName: "KwakoPos-v2.7.0",
        gitRoot: "/projects/KwakoPos-v2.7.0",
        branch: "main",
        commitSha: "abc1234",
        gitTag: "v2.7.0",
        isDirty: false,
        packageVersion: "2.7.0",
        projectName: "KwakoPos",
      };
      const remoteRelease = {
        repo: "Kwakoko/KwakoPosv2",
        tag: "v2.8.0",
        version: "2.8.0",
        commitSha: "def5678",
        publishedAt: new Date().toISOString(),
        draft: false,
        prerelease: false,
        certified: true,
        htmlUrl: "",
      };

      const drift = detectVersionDrift(localRepo, remoteRelease);
      expect(drift.status).toBe("OUTDATED");
    });

    it("should detect BLOCKED state when working tree is dirty", () => {
      const localRepo = {
        absolutePath: "/projects/KwakoPos-v2.7.0",
        folderName: "KwakoPos-v2.7.0",
        gitRoot: "/projects/KwakoPos-v2.7.0",
        branch: "main",
        commitSha: "abc1234",
        gitTag: "v2.7.0",
        isDirty: true,
        packageVersion: "2.7.0",
        projectName: "KwakoPos",
      };
      const remoteRelease = {
        repo: "Kwakoko/KwakoPosv2",
        tag: "v2.8.0",
        version: "2.8.0",
        commitSha: "def5678",
        publishedAt: new Date().toISOString(),
        draft: false,
        prerelease: false,
        certified: true,
        htmlUrl: "",
      };

      const drift = detectVersionDrift(localRepo, remoteRelease);
      expect(drift.status).toBe("BLOCKED");
    });
  });

  describe("Metadata Management & Atomic Operation", () => {
    it("should read and write synchronization metadata accurately", () => {
      const sampleMeta = {
        project: "KwakoPos",
        repository: "Kwakoko/KwakoPosv2",
        release: "v2.8.0",
        commit: "abc123456789",
        folder: "KwakoPos-v2.8.0",
        previous_folder: "KwakoPos-v2.7.0",
        synced_at: new Date().toISOString(),
        status: "SYNCHRONIZED" as const,
        machine: "test-host",
        mode: "MODE_A" as const,
      };

      writeSyncMetadata(sampleMeta, tempDir);
      const readBack = readSyncMetadata(tempDir);

      expect(readBack).toBeDefined();
      expect(readBack?.folder).toBe("KwakoPos-v2.8.0");
      expect(readBack?.previous_folder).toBe("KwakoPos-v2.7.0");
    });

    it("should perform dry-run synchronization without mutating filesystem", async () => {
      // Setup mock folder
      const mockProjectDir = path.join(tempDir, "KwakoPos-v2.7.0");
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const result = await synchronizeLocalVersionFolder({
        cwd: mockProjectDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: "1234567890abcdef",
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("DRY_RUN_SUCCESS");
      expect(fs.existsSync(mockProjectDir)).toBe(true);
    });

    it("should abort synchronization if target folder collision exists", async () => {
      const currentDir = path.join(tempDir, "KwakoPos-v2.7.0");
      const targetDir = path.join(tempDir, "KwakoPos-v2.8.0");

      fs.mkdirSync(currentDir, { recursive: true });
      fs.mkdirSync(targetDir, { recursive: true });

      fs.writeFileSync(path.join(currentDir, "package.json"), JSON.stringify({ name: "KwakoPos", version: "2.7.0" }), "utf8");

      const result = await synchronizeLocalVersionFolder({
        cwd: currentDir,
        mockRelease: {
          repo: "Kwakoko/KwakoPosv2",
          tag: "v2.8.0",
          version: "2.8.0",
          commitSha: "1234567890abcdef",
          publishedAt: new Date().toISOString(),
          draft: false,
          prerelease: false,
          certified: true,
          htmlUrl: "",
        },
      });

      expect(result.success).toBe(false);
      expect(result.actionTaken).toBe("SYNC_ABORTED_COLLISION");
      expect(result.error).toContain("TARGET DIRECTORY EXISTS");
    });
  });
});
