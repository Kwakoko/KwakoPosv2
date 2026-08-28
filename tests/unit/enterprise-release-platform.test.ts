import { describe, it, expect } from "vitest";
import { generateReleaseManifest } from "../../scripts/release/release-manifest-generator.js";
import { generateSBOM } from "../../scripts/release/sbom-generator.js";
import { generateArtifactAttestation } from "../../scripts/release/artifact-attestor.js";
import { evaluateReleaseRisk } from "../../scripts/release/release-risk-engine.js";
import { ReleaseStateMachineEngine } from "../../scripts/release/release-state-machine.js";
import { ProgressiveDeliveryController } from "../../scripts/release/progressive-delivery-controller.js";
import { computeDORAMetrics } from "../../scripts/release/dora-metrics-engine.js";
import { runDisasterRecoveryVerification } from "../../scripts/release/disaster-recovery-verifier.js";
import { globalReleaseService } from "../../apps/api/src/services/releaseService.js";

describe("KwakoPos Enterprise Release Engineering & Supply Chain Suite", () => {
  it("1. Generates canonical Release Manifest (release-manifest.json)", () => {
    const manifest = generateReleaseManifest({ version: "2.2.0" });
    expect(manifest.product).toBe("KwakoPos SaaS");
    expect(manifest.version).toBe("2.2.0");
    expect(manifest.artifactDigest).toContain("sha256:");
    expect(manifest.deploymentStrategy).toBe("CANARY");
  });

  it("2. Generates SPDX 2.3 & CycloneDX 1.4 compliant Software Bill of Materials (SBOM)", () => {
    const { spdx, cyclonedx } = generateSBOM("2.2.0");
    expect(spdx.spdxVersion).toBe("SPDX-2.3");
    expect(spdx.packages.length).toBeGreaterThan(1);
    expect(cyclonedx.bomFormat).toBe("CycloneDX");
    expect(cyclonedx.specVersion).toBe("1.4");
  });

  it("3. Generates SLSA Build Level 3 aligned Provenance Attestation & SHA-256 Digest", () => {
    const { attestation, digest } = generateArtifactAttestation("2.2.0");
    expect(attestation._type).toBe("https://in-toto.io/Statement/v0.1");
    expect(attestation.predicateType).toBe("https://slsa.dev/provenance/v0.2");
    expect(digest).toContain("sha256:");
  });

  it("4. Evaluates Release Risk Score (0-100) and risk level classification", () => {
    const lowRisk = evaluateReleaseRisk({ filesChanged: 5, modulesChanged: ["Docs"] });
    expect(lowRisk.riskLevel).toBe("LOW");
    expect(lowRisk.score).toBeLessThan(25);

    const highRisk = evaluateReleaseRisk({ filesChanged: 60, hasAuthChanges: true, hasDatabaseMigration: true });
    expect(highRisk.riskLevel).toBe("CRITICAL");
    expect(highRisk.score).toBeGreaterThanOrEqual(75);
    expect(highRisk.requiresManualApproval).toBe(true);
  });

  it("5. Enforces 13-state deterministic Release Lifecycle State Machine transitions", () => {
    const sm = new ReleaseStateMachineEngine("DRAFT");
    expect(sm.getCurrentState()).toBe("DRAFT");

    sm.transitionTo("VALIDATING", "Start validation");
    expect(sm.getCurrentState()).toBe("VALIDATING");

    sm.transitionTo("QUALITY_PASSED", "Quality passed");
    sm.transitionTo("SECURITY_PASSED", "Security passed");
    sm.transitionTo("BUILT", "Build compiled");
    sm.transitionTo("ATTESTED", "Attestation created");
    sm.transitionTo("STAGING", "Staging deployed");
    sm.transitionTo("STAGING_CERTIFIED", "Staging certified");
    sm.transitionTo("PRODUCTION_READY", "Production ready");
    sm.transitionTo("CANARY", "Canary started");
    sm.transitionTo("PROMOTING", "Promoting traffic");
    sm.transitionTo("PRODUCTION", "Active Cloud Run revision updated");
    sm.transitionTo("VERIFIED", "Health check passed");
    sm.transitionTo("RELEASED", "Published");

    expect(sm.getCurrentState()).toBe("RELEASED");

    // Invalid transition check
    const invalidSm = new ReleaseStateMachineEngine("DRAFT");
    expect(() => invalidSm.transitionTo("PRODUCTION", "Bypass check")).toThrow("Invalid release state transition");
  });

  it("6. Controls Tenant-Aware Progressive Delivery and Canary Traffic Allocation", () => {
    const controller = new ProgressiveDeliveryController("2.2.0");
    expect(controller.isTenantEligibleForVersion("TENANT-INTERNAL-HQ")).toBe(true);

    const p1 = controller.promoteStage(); // CANARY_TENANT
    expect(p1.newStage).toBe("CANARY_TENANT");
    expect(controller.isTenantEligibleForVersion("TENANT-BETA-001")).toBe(true);

    const p2 = controller.promoteStage(); // PERCENT_1
    expect(p2.trafficPercentage).toBe(1);

    const halt = controller.haltRollout("Tenant sync error detected");
    expect(halt.status).toBe("HALTED");
    expect(controller.getStatus().trafficPercentage).toBe(0);
  });

  it("7. Computes 5 DORA Delivery Performance Metrics & Incident Correlation", () => {
    const dora = computeDORAMetrics();
    expect(dora.deploymentFrequencyPerWeek).toBeGreaterThan(0);
    expect(dora.leadTimeForChangesHours).toBeGreaterThan(0);
    expect(dora.meanTimeToRecoveryMinutes).toBeGreaterThan(0);
    expect(dora.changeFailureRatePercentage).toBeGreaterThanOrEqual(0);
    expect(dora.performanceTier).toBe("ELITE");
    expect(dora.recentIncidents.length).toBeGreaterThan(0);
  });

  it("8. Verifies 5-Phase Database Schema Migration Safety Pattern and Disaster Recovery", () => {
    const dr = runDisasterRecoveryVerification();
    expect(dr.overallCertified).toBe(true);
    expect(dr.phases.length).toBe(5);
    expect(dr.backupVerification.backupAvailable).toBe(true);
    expect(dr.backupVerification.pointInTimeRecoverySupported).toBe(true);
  });

  it("9. Serves complete Super Admin Release Engineering Center Dashboard data via ReleaseService", async () => {
    const dashboard = await globalReleaseService.getDashboardData();
    expect(dashboard.currentVersion).toBeDefined();
    expect(dashboard.releaseManifest).toBeDefined();
    expect(dashboard.sbom).toBeDefined();
    expect(dashboard.attestation).toBeDefined();
    expect(dashboard.riskAssessment).toBeDefined();
    expect(dashboard.doraMetrics).toBeDefined();
    expect(dashboard.disasterRecovery.overallCertified).toBe(true);
  });
});
