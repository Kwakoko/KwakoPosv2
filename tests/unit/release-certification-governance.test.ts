import { describe, expect, it } from "vitest";
import {
  KWAKOKO_RELEASE_CERTIFICATION_CERTIFICATE,
  RELEASE_CERTIFICATION_GATES,
  RELEASE_CERTIFICATION_INVARIANTS,
} from "@kwakopos2/config";
import { certifyReleaseEvidence } from "@kwakopos2/domain";

const baseEvidence = () => ({
  releaseId: "RC-TEST-001",
  version: "2.12.5",
  gitSha: "0123456789012345678901234567890123456789",
  buildPassed: true,
  typecheckPassed: true,
  testsPassed: true,
  securityPassed: true,
  privacyPassed: true,
  tenantIsolationPassed: true,
  offlineSyncPassed: true,
  migrationPassed: true,
  reliabilityPassed: true,
  performancePassed: true,
  rollbackReady: true,
  provenanceVerified: true,
  attestationVerified: true,
  evidenceClassificationValid: true,
  governanceConvergencePassed: true,
  finalApprovalPresent: true,
});

describe("Step 24 — Release Certification Governance", () => {
  it("defines one certificate and the complete 15-gate release contract", () => {
    expect(KWAKOKO_RELEASE_CERTIFICATION_CERTIFICATE).toBe("KWAKOKO-RELEASE-CERTIFICATION-CERTIFICATE-v1.0");
    expect(RELEASE_CERTIFICATION_GATES).toHaveLength(15);
    expect(RELEASE_CERTIFICATION_INVARIANTS).toHaveLength(17);
  });

  it("passes a complete controlled certification", () => {
    const result = certifyReleaseEvidence(baseEvidence());
    expect(result.decision).toBe("PASS");
    expect(result.gatesPassed).toBe(15);
    expect(result.gatesFailed).toBe(0);
    expect(result.evidenceClassification).toBe("CONTROLLED_CERTIFICATION");
  });

  it("blocks a release when tenant isolation fails", () => {
    const result = certifyReleaseEvidence({ ...baseEvidence(), tenantIsolationPassed: false });
    expect(result.decision).toBe("BLOCK");
    expect(result.failedGates).toContain("tenant-isolation");
  });

  it("blocks unsupported production outcome claims", () => {
    const result = certifyReleaseEvidence({ ...baseEvidence(), productionOutcomeClaimsUnverified: true });
    expect(result.decision).toBe("BLOCK");
    expect(result.failedGates).toContain("evidence-classification");
  });
});
