import { describe, expect, it } from "vitest";
import { KWAKOKO_DATA_LIFECYCLE_DR_GOVERNANCE as G } from "../../packages/config/src/dataLifecycleDrGovernance.js";

describe("Kwakoko Data Lifecycle & DR Governance", () => {
  it("defines the lifecycle state machine", () => {
    expect(G.lifecycle).toEqual(["CREATE","ACTIVE","ARCHIVE","RETENTION_REVIEW","LEGAL_HOLD","DELETE","VERIFIED_ERASURE"]);
  });
  it("defines deterministic RPO/RTO tiers", () => {
    expect(G.recoveryObjectives.tier0.rpoSeconds).toBe(0);
    expect(G.recoveryObjectives.tier1.rtoSeconds).toBe(30);
    expect(G.recoveryObjectives.tier3.rpoSeconds).toBe(300);
  });
  it("requires verified recovery and rollback invariants", () => {
    expect(G.certification.requireRecoveryReconciliation).toBe(true);
    expect(G.certification.requireRollbackAuthorization).toBe(true);
    expect(G.certification.requireSnapshotIntegrity).toBe(true);
  });
  it("requires evidence classification", () => {
    expect(G.certification.requireEvidenceClassification).toBe(true);
    expect(G.invariants.some((x) => x.includes("simulation evidence"))).toBe(true);
  });
  it("requires the ten controlled disaster scenarios", () => {
    expect(G.certification.requiredScenarioCount).toBe(10);
    expect(G.certification.requireAllScenarios).toBe(true);
  });
  it("defines the Step 13 release certificate", () => {
    expect(G.certification.certificate).toBe("KWAKOKO-LIFECYCLE-DR-CERTIFICATE-v1.0");
    expect(G.certification.failClosed).toBe(true);
  });
});
