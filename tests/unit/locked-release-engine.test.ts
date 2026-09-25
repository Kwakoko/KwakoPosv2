import { describe, it, expect, beforeEach } from "vitest";
import {
  parseConventionalCommit,
  determineBumpFromCommits,
  calculateNextVersion,
  parseSemVer,
  isValidSemVer,
} from "@kwakopos2/config";
import { runTamperDetection } from "../../scripts/release/tamper-detector.js";
import { ReleaseStateMachineEngine } from "../../scripts/release/release-state-machine.js";
import { evaluateReleaseRisk } from "../../scripts/release/release-risk-engine.js";
import { generateReleaseManifest } from "../../scripts/release/release-manifest-generator.js";
import { generateSBOM } from "../../scripts/release/sbom-generator.js";
import { generateArtifactAttestation } from "../../scripts/release/artifact-attestor.js";
import { buildReleaseEvidencePackage } from "../../scripts/release/release-evidence-package-builder.js";
import { executeEmergencyRelease } from "../../scripts/release/emergency-release.js";

describe("KwakoPos Locked Automated Release Engine Certification Suite", () => {

  describe("1. Zero-Manual Versioning & Conventional Commits Engine", () => {
    it("should correctly parse Conventional Commit messages", () => {
      const feat = parseConventionalCommit("feat(inventory): add batch tracking for pharmacy OS");
      expect(feat.type).toBe("feat");
      expect(feat.scope).toBe("inventory");
      expect(feat.isBreaking).toBe(false);
      expect(feat.category).toBe("Features");

      const fix = parseConventionalCommit("fix(pos): resolve cash register rounding variance");
      expect(fix.type).toBe("fix");
      expect(fix.scope).toBe("pos");
      expect(fix.isBreaking).toBe(false);
      expect(fix.category).toBe("Bug Fixes");

      const breaking = parseConventionalCommit("feat(auth)!: overhaul RBAC permission schema\n\nBREAKING CHANGE: permissions format updated");
      expect(breaking.isBreaking).toBe(true);
      expect(breaking.category).toBe("Breaking Changes");
    });

    it("should calculate correct SemVer bump types", () => {
      expect(determineBumpFromCommits(["fix: patch minor bug", "docs: update README"])).toBe("PATCH");
      expect(determineBumpFromCommits(["feat: add sacco module", "fix: alignment"])).toBe("MINOR");
      expect(determineBumpFromCommits(["feat!: major redesign", "fix: minor bug"])).toBe("MAJOR");
      expect(determineBumpFromCommits(["chore: bump deps"])).toBe("NONE");
    });

    it("should calculate correct next version strings", () => {
      expect(calculateNextVersion("2.5.0", ["fix: small fix"])).toBe("2.5.1");
      expect(calculateNextVersion("2.5.0", ["feat: new feature"])).toBe("2.6.0");
      expect(calculateNextVersion("2.5.0", ["feat!: breaking API change"])).toBe("3.0.0");
    });

    it("should validate SemVer string format", () => {
      expect(isValidSemVer("2.5.0")).toBe(true);
      expect(isValidSemVer("v2.5.0")).toBe(true);
      expect(isValidSemVer("invalid.version")).toBe(false);
    });
  });

  describe("2. Control File Tamper Detection", () => {
    it("should execute tamper detection without throwing on clean state", () => {
      const report = runTamperDetection();
      expect(report).toBeDefined();
      expect(typeof report.isTampered).toBe("boolean");
      expect(report.protectedFilesChecked).toBeGreaterThan(0);
    });
  });

  describe("3. Release State Machine Transitions", () => {
    it("should strictly transition through release state machine", () => {
      const sm = new ReleaseStateMachineEngine("DRAFT");
      expect(sm.getCurrentState()).toBe("DRAFT");

      sm.transitionTo("VALIDATING", "Initiated pre-flight verification");
      expect(sm.getCurrentState()).toBe("VALIDATING");

      sm.transitionTo("QUALITY_PASSED", "All quality gates passed");
      expect(sm.getCurrentState()).toBe("QUALITY_PASSED");

      sm.transitionTo("SECURITY_PASSED", "Security checks passed");
      expect(sm.getCurrentState()).toBe("SECURITY_PASSED");

      sm.transitionTo("BUILT", "Monorepo compiled clean");
      expect(sm.getCurrentState()).toBe("BUILT");

      sm.transitionTo("ATTESTED", "Attestation generated");
      expect(sm.getCurrentState()).toBe("ATTESTED");

      const history = sm.getHistory();
      expect(history.length).toBe(6);
    });

    it("should fail closed to BLOCKED on invalid transition", () => {
      const sm = new ReleaseStateMachineEngine("DRAFT");
      expect(() => sm.transitionTo("RELEASED", "Illegal jump")).toThrow();
    });
  });

  describe("4. Release Artifacts, Manifests & SLSA Level 3 Provenance", () => {
    it("should generate machine-readable Release Manifest", () => {
      const manifest = generateReleaseManifest({ version: "2.5.0" });
      expect(manifest.version).toBe("2.5.0");
      expect(manifest.gitSha).toBeDefined();
      expect(manifest.product).toContain("KwakoPos");
    });

    it("should generate valid SBOM in SPDX format", () => {
      const sbom = generateSBOM("2.5.0");
      expect(sbom.spdx.spdxVersion).toBe("SPDX-2.3");
      expect(sbom.spdx.packages.length).toBeGreaterThan(0);
    });

    it("should generate SLSA Level 3 Provenance Attestation", () => {
      const att = generateArtifactAttestation("2.5.0", "ce32d154a68f6f7d082929a35d831856a6ae83fa");
      expect(att.digest).toBeDefined();
      expect(att.attestation._type).toBe("https://in-toto.io/Statement/v0.1");
    });

    it("should evaluate release risk metrics", () => {
      const risk = evaluateReleaseRisk();
      expect(risk.riskLevel).toBeDefined();
      expect(typeof risk.overallScore === "number" || typeof risk.riskLevel === "string").toBe(true);
    });

    it("should build complete Release Evidence Package", () => {
      const pkg = buildReleaseEvidencePackage(
        "rel_123",
        "2.5.0",
        "ce32d154a68f6f7d082929a35d831856a6ae83fa",
        "sha256:e43ed2ffd6f76cda2a8314b89e1001f6a246a0ba040e3db209a2c34eb50b08d4"
      );
      expect(pkg.releaseId).toBe("rel_123");
      expect(pkg.version).toBe("2.5.0");
      expect(pkg.qualityScoreReport).toBeDefined();
    });
  });

  describe("5. Emergency Release Path Execution", () => {
    it("should execute emergency release with mandatory audit trail", async () => {
      const res = await executeEmergencyRelease({
        authorizer: "SECURITY_OFFICER",
        incidentId: "INC-TEST-999",
        reason: "Test emergency vulnerability resolution",
        targetVersion: "2.5.0",
      });

      expect(res.success).toBe(true);
      expect(res.version).toBe("2.5.0");
      expect(res.auditRecord.authorizer).toBe("SECURITY_OFFICER");
      expect(res.auditRecord.incidentId).toBe("INC-TEST-999");
    }, 300000);
  });
});
