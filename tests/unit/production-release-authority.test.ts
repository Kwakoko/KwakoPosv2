import { describe, expect, it } from "vitest";
import {
  assessProductionRelease,
  nextProductionStage,
  assertProductionPromotionAllowed,
} from "@kwakopos2/domain";

const completeEvidence = {
  unifiedCertification: true, authenticatedIdentity: true, candidateReady: true, zeroTrafficDeployed: true,
  tenantCanaryPassed: true, healthPassed: true, liveIdentityMatched: true, synchronizationPassed: true,
  databaseCompatibilityPassed: true, observabilityPassed: true, performancePassed: true, rollbackReady: true,
  killSwitchReady: true, trafficIntegrityPassed: true, auditEvidencePresent: true,
  evidenceClass: "DEPLOYED" as const,
};

describe("production release authority", () => {
  it("allows a fully evidenced progressive promotion", () => {
    const assessment = assessProductionRelease(completeEvidence, "PERCENT_5");
    expect(assessment.decision).toBe("PASS");
    assertProductionPromotionAllowed(assessment, "PERCENT_5");
  });
  it("blocks failed health evidence", () => {
    const assessment = assessProductionRelease({ ...completeEvidence, healthPassed: false }, "PERCENT_25");
    expect(assessment.decision).toBe("BLOCK");
    expect(assessment.failedGates).toContain("health-readiness");
  });
  it("blocks simulated evidence", () => {
    const assessment = assessProductionRelease({ ...completeEvidence, evidenceClass: "SIMULATED" }, "PERCENT_1");
    expect(assessment.decision).toBe("BLOCK");
  });
  it("requires progressive stage ordering", () => {
    expect(nextProductionStage("ZERO_TRAFFIC")).toBe("INTERNAL");
    expect(nextProductionStage("PERCENT_50")).toBe("PERCENT_100");
  });
});
