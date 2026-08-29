import { describe, it, expect } from "vitest";
import { UiCertificationEngine } from "@kwakopos2/domain";
import { runUiCertificationProgram } from "../../scripts/certification/ui-certification-engine.js";

describe("Phase 30 — KwakoPos UI Certification (KUCF) Test Suite", () => {
  const engine = new UiCertificationEngine();

  it("should generate machine-readable JSON evidence records bound to Release Identity and Git SHA", () => {
    const evidence = engine.generateMachineReadableEvidence("2.5.0", "1b33c0c");
    expect(evidence.releaseVersion).toBe("2.5.0");
    expect(evidence.gitSha).toBe("1b33c0c");
    expect(evidence.domainResults.length).toBe(12);
    expect(evidence.isApproved).toBe(true);
  });

  it("should handle dynamic certification revalidation triggers on material code mutations", () => {
    const evidence = engine.generateMachineReadableEvidence("2.5.0", "1b33c0c");
    const sm = engine.triggerRevalidation(evidence.certificationId, "IndexedDB schema migration");
    expect(sm.status).toBe("REVALIDATION_REQUIRED");
    expect(sm.revalidationReason).toBe("IndexedDB schema migration");
  });

  it("should verify health summary reporting 100% UI certification compliance", () => {
    const health = engine.getHealthSummary();
    expect(health.platformUiCertified).toBe(true);
    expect(health.kucfFrameworkOperational).toBe(true);
  });

  it("should pass 100% of the 80-Pillar UI Certification Framework campaign", () => {
    const cert = runUiCertificationProgram();
    expect(cert.totalPillars).toBe(80);
    expect(cert.passedPillars).toBe(80);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
