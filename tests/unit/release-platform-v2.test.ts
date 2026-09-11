import { describe, it, expect } from "vitest";
import { evaluateReleasePolicies, DEFAULT_PRODUCTION_POLICY } from "../../scripts/release/release-policy-engine.js";
import { createReleaseCandidateEntity, acquireVersionLock, releaseVersionLock } from "../../scripts/release/release-candidate-engine.js";
import { analyzeChangeImpact } from "../../scripts/release/change-impact-analyzer.js";
import { runFullPlatformCertification, executeDomainCertificationSuite } from "../../scripts/release/domain-certification-engine.js";
import { runCanonicalCrossClientTest } from "../../scripts/release/canonical-cross-client-test.js";
import { detectReleaseDrift } from "../../scripts/release/release-reconciliation-engine.js";
import { computeReleaseQualityScore, buildReleaseEvidencePackage } from "../../scripts/release/release-evidence-package-builder.js";
import { globalReleaseService } from "../../apps/api/src/services/releaseService.js";

describe("KwakoPos Release Engineering Platform v2 Suite", () => {
  it("1. Evaluates 15-category declarative Policy Engine and generates decision record", () => {
    const decision = evaluateReleasePolicies("rel_test_001", "2.2.0", {
      testCoveragePercent: 88.5,
      criticalVulnerabilities: 0,
      highVulnerabilities: 0,
      hasProvenance: true,
      hasSBOM: true,
      hasAttestation: true,
      hasMigrationBackup: true,
      tenantIsolationPassed: true,
      riskLevel: "LOW",
    });

    expect(decision.decision).toBe("PASS");
    expect(decision.rulesEvaluated).toBe(15);
    expect(decision.rulesPassed).toBe(15);
    expect(decision.rulesFailed).toBe(0);
    expect(decision.categories["commit-policy"].status).toBe("PASS");
    expect(decision.categories["security-policy"].status).toBe("PASS");
    expect(decision.categories["tenant-safety-policy"].status).toBe("PASS");
  });

  it("2. Blocks release when policy threshold is breached", () => {
    const decision = evaluateReleasePolicies("rel_test_002", "2.2.0", {
      testCoveragePercent: 65.0, // Below 80% threshold
      tenantIsolationPassed: false, // Critical failure
    });

    expect(decision.decision).toBe("BLOCKED");
    expect(decision.rulesFailed).toBeGreaterThan(0);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it("3. Creates Release Candidate entity and acquires atomic version lock", () => {
    const version = "2.2.0-rc.1";
    const rc = createReleaseCandidateEntity(version, "abc1234", "sha256:digest123");

    expect(rc.version).toBe(version);
    expect(rc.status).toBe("VALIDATING");
    expect(rc.rcNumber).toContain("RC-");

    // Second lock attempt on same version should fail
    const lockTry = acquireVersionLock(version);
    expect(lockTry.success).toBe(false);

    // Release lock
    releaseVersionLock(version);
    const retryLock = acquireVersionLock(version);
    expect(retryLock.success).toBe(true);
    releaseVersionLock(version);
  });

  it("4. Analyzes Change Impact to select required domain certification suites", () => {
    const analysis = analyzeChangeImpact([
      "apps/api/src/services/inventoryService.ts",
      "packages/sync/src/index.ts",
      "packages/auth/src/index.ts",
      "packages/database/prisma/migrations/001/migration.sql",
    ]);

    expect(analysis.hasAuthChanges).toBe(true);
    expect(analysis.hasInventoryChanges).toBe(true);
    expect(analysis.hasSyncChanges).toBe(true);
    expect(analysis.hasDatabaseMigrations).toBe(true);
    expect(analysis.requiredCertificationSuites).toContain("AUTH");
    expect(analysis.requiredCertificationSuites).toContain("INVENTORY");
    expect(analysis.requiredCertificationSuites).toContain("OFFLINE_SYNC");
    expect(analysis.impactScore).toBeGreaterThan(50);
  });

  it("5. Executes multi-domain platform certification suites", () => {
    const report = runFullPlatformCertification("rel_test_003", "2.2.0", [
      "CORE",
      "AUTH",
      "POS",
      "INVENTORY",
      "STOCK_LEDGER",
      "OFFLINE_SYNC",
      "PWA",
      "TENANT",
    ]);

    expect(report.overallStatus).toBe("CERTIFIED");
    expect(report.overallScore).toBe(100);
    expect(report.suites.length).toBe(8);
  });

  it("6. Runs Canonical Cross-Client Transaction Test (Browser A -> Server -> Browser B)", () => {
    if (!process.env.CANDIDATE_URL || process.env.NODE_ENV !== "production-certification") {
      expect(() => runCanonicalCrossClientTest()).toThrow("REAL_RUNTIME_REQUIRED");
      return;
    }
    const res = runCanonicalCrossClientTest();

    expect(res.status).toBe("PASS");
    expect(res.browserA.finalStock).toBe(85);
    expect(res.browserB.calculatedBalance).toBe(85);
    expect(res.serverSync.outboxSynced).toBe(true);
    expect(res.resilienceChecks.refreshPersistence).toBe(true);
    expect(res.resilienceChecks.logoutLoginPersistence).toBe(true);
  });

  it("7. Detects release drift between running environment and expected release manifest", () => {
    const expected = {
      version: "2.2.0",
      gitSha: "ba66335",
      artifactDigest: "sha256:expected_digest",
      schemaVersion: "2.2.0",
    };

    // Case 1: In Sync
    const syncRes = detectReleaseDrift(expected, {
      version: "2.2.0",
      gitSha: "ba66335",
      artifactDigest: "sha256:expected_digest",
      schemaVersion: "2.2.0",
    });
    expect(syncRes.driftDetected).toBe(false);

    // Case 2: Drift Detected
    const driftRes = detectReleaseDrift(expected, {
      version: "2.1.0", // Outdated version
      artifactDigest: "sha256:old_digest",
    });
    expect(driftRes.driftDetected).toBe(true);
    expect(driftRes.mismatches.length).toBeGreaterThan(0);
    expect(driftRes.reconciliationAction).toBe("ALERT_TRIGGERED");
  });

  it("8. Computes Release Quality Score and compiles Release Evidence Package", () => {
    const score = computeReleaseQualityScore(1.0, 0, true, 25, 1.0);
    expect(score.releaseQualityScore).toBe(100);
    expect(score.grade).toBe("A+");
    expect(score.certified).toBe(true);

    const pkg = buildReleaseEvidencePackage("rel_test_004", "2.2.0", "ba66335", "sha256:digest");
    expect(pkg.filesIncluded).toContain("release-manifest.json");
    expect(pkg.filesIncluded).toContain("sbom.spdx.json");
    expect(pkg.filesIncluded).toContain("provenance.json");
    expect(pkg.qualityScoreReport.releaseQualityScore).toBeGreaterThanOrEqual(80);
  });

  it("9. Serves Super Admin Release Platform V2 API endpoints", async () => {
    const policyDecision = await globalReleaseService.evaluateReleasePolicies();
    expect(policyDecision.decision).toBe("PASS");

    const rc = await globalReleaseService.createReleaseCandidate("2.2.0-rc.2");
    expect(rc.rcNumber).toContain("RC-");

    const impact = await globalReleaseService.analyzeChangeImpact();
    expect(impact.requiredCertificationSuites).toContain("CORE");

    const drift = await globalReleaseService.detectDrift();
    expect(drift.driftDetected).toBe(false);

    const compare = await globalReleaseService.compareReleases("2.1.0", "2.2.0");
    expect(compare.fromVersion).toBe("2.1.0");
    expect(compare.toVersion).toBe("2.2.0");

    const evidencePkg = await globalReleaseService.getEvidencePackage("2.2.0");
    expect(evidencePkg.filesIncluded.length).toBeGreaterThan(5);
  });
});
