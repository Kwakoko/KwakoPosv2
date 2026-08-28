import { describe, it, expect } from "vitest";
import { parseConventionalCommit, calculateNextVersion } from "../../packages/config/src/semverEngine.js";
import { validateCommitMessage } from "../../scripts/ci/validate-commit-message.js";
import { categorizeExtendedCommits, formatChangelogSection } from "../../scripts/release/generate-changelog.js";
import { generateAIReleaseSummary } from "../../scripts/release/ai-release-notes-generator.js";
import { runDatabaseMigrationGate } from "../../scripts/release/database-migration-gate.js";
import { runReleaseQualityGates } from "../../scripts/release/quality-gates.js";
import { runDeploymentHealthChecks } from "../../scripts/release/health-check-gate.js";
import { executeAutomatedRollback } from "../../scripts/release/rollback-engine.js";
import { verifyAllKwakoPosModules } from "../../scripts/release/verify-kwakopos-modules.js";
import { globalReleaseRepository } from "../../packages/database/src/index.js";
import { globalReleaseNotificationService } from "../../apps/api/src/services/releaseNotificationService.js";
import { globalReleaseService } from "../../apps/api/src/services/releaseService.js";

describe("KwakoPos Enterprise Automated Release & CI/CD Pipeline Suite", () => {
  describe("1. Conventional Commit Enforcement & SemVer Engine", () => {
    it("validates correct Conventional Commit syntax", () => {
      expect(validateCommitMessage("feat(pos): add offline cash session").isValid).toBe(true);
      expect(validateCommitMessage("fix(sync): resolve delta replay order").isValid).toBe(true);
      expect(validateCommitMessage("perf(db): optimize ledger index query").isValid).toBe(true);
      expect(validateCommitMessage("security(auth): enforce refresh token rotation").isValid).toBe(true);
      expect(validateCommitMessage("random unformatted commit").isValid).toBe(false);
    });

    it("calculates SemVer bump correctly", () => {
      expect(calculateNextVersion("2.2.0", ["fix: bug fix"])).toBe("2.2.1");
      expect(calculateNextVersion("2.2.0", ["feat: new feature"])).toBe("2.3.0");
      expect(calculateNextVersion("2.2.0", ["feat!: breaking change"])).toBe("3.0.0");
    });
  });

  describe("2. Automated Changelog & AI Release Notes Generator", () => {
    it("categorizes commits into structured CHANGELOG sections", () => {
      const commits = [
        { hash: "sha1", author: "Dev A", message: "feat(inventory): real-time stock alert" },
        { hash: "sha2", author: "Dev B", message: "fix(pos): receipt printing alignment" },
        { hash: "sha3", author: "Dev C", message: "security(auth): hard-close expired sessions" },
      ];
      const section = categorizeExtendedCommits("2.3.0", commits);
      expect(section.version).toBe("2.3.0");
      expect(section.features.length).toBe(1);
      expect(section.bugFixes.length).toBe(1);
      expect(section.securityUpdates.length).toBe(1);

      const formatted = formatChangelogSection(section);
      expect(formatted).toContain("## [2.3.0]");
      expect(formatted).toContain("New Features");
    });

    it("generates human-readable AI release summary", () => {
      const summary = generateAIReleaseSummary("2.3.0", [
        "feat(sync): introduce Offline Sync Engine",
        "fix(pos): fix receipt layout bug",
      ]);
      expect(summary).toContain("KwakoPos Version 2.3.0");
      expect(summary.length).toBeGreaterThan(30);
    });
  });

  describe("3. Database Migration & Quality Gates Engine", () => {
    it("passes database migration safety gate", () => {
      const res = runDatabaseMigrationGate({ dryRun: true });
      expect(res.passed).toBe(true);
      expect(res.schemaIntegrityVerified).toBe(true);
    });

    it("evaluates 15-point release quality gates", async () => {
      const res = await runReleaseQualityGates();
      expect(res.gates.length).toBe(15);
      expect(res.overallPassed).toBe(true);
    });
  });

  describe("4. Post-Deployment Health Check & Automated Rollback", () => {
    it("executes post-deployment synthetic health verification", async () => {
      const res = await runDeploymentHealthChecks();
      expect(res.checks.length).toBe(12);
      expect(res.allPassed).toBe(true);
    });

    it("executes intelligent automated rollback", async () => {
      const res = await executeAutomatedRollback({
        failedVersion: "2.3.0",
        targetStableVersion: "2.2.0",
        reason: "Synthetic test rollback",
      });
      expect(res.success).toBe(true);
      expect(res.restoredComponents).toContain("Application Version");
    });
  });

  describe("5. Release Database, Multi-Channel Notifications & Super Admin Portal", () => {
    it("records and retrieves release history in ReleaseRepository", () => {
      const ver = globalReleaseRepository.recordAppVersion({
        version: "2.2.0",
        releaseNotes: "Test release notes",
      });
      expect(ver.version).toBe("2.2.0");

      const latest = globalReleaseRepository.getLatestVersion();
      expect(latest?.version).toBe("2.2.0");

      const metrics = globalReleaseRepository.getReleaseMetrics();
      expect(metrics.totalReleases).toBeGreaterThan(0);
    });

    it("dispatches multi-channel release notifications", async () => {
      const notif = await globalReleaseNotificationService.notifyReleaseEvent({
        version: "2.2.0",
        deploymentStatus: "DEPLOYED",
        releaseNotes: "Production release completed cleanly.",
      });
      expect(notif.sentCount).toBeGreaterThan(0);
      expect(notif.channels.length).toBe(5);
    });

    it("serves Super Admin Release Center dashboard API", async () => {
      const dashboard = await globalReleaseService.getDashboardData();
      expect(dashboard.currentVersion).toBeDefined();
      expect(dashboard.metrics).toBeDefined();
      expect(dashboard.releaseTimeline.length).toBeGreaterThan(0);
    });

    it("verifies operational integrity of all 15 KwakoPos platform modules", async () => {
      const modRes = await verifyAllKwakoPosModules();
      expect(modRes.results.length).toBe(15);
      expect(modRes.allPassed).toBe(true);
    });
  });
});
