import { describe, expect, it } from "vitest";
import { KWAKOKO_PRIVACY_DATA_GOVERNANCE } from "../../packages/config/src/privacyDataGovernance.js";

describe("Kwakoko privacy, compliance and data governance", () => {
  it("enforces the core privacy principles", () => {
    expect(Object.values(KWAKOKO_PRIVACY_DATA_GOVERNANCE.principles).every(Boolean)).toBe(true);
  });
  it("requires privacy and legal authorities", () => {
    expect(Object.keys(KWAKOKO_PRIVACY_DATA_GOVERNANCE.requiredAuthorities).length).toBe(9);
  });
  it("requires tenant-scoped data operations", () => {
    expect(KWAKOKO_PRIVACY_DATA_GOVERNANCE.principles.tenantDataIsolation).toBe(true);
  });
  it("requires attributable and auditable consent", () => {
    expect(KWAKOKO_PRIVACY_DATA_GOVERNANCE.principles.consentGovernance).toBe(true);
    expect(KWAKOKO_PRIVACY_DATA_GOVERNANCE.principles.auditability).toBe(true);
  });
  it("governs deletion and retention together", () => {
    expect(KWAKOKO_PRIVACY_DATA_GOVERNANCE.principles.deletionGovernance).toBe(true);
    expect(KWAKOKO_PRIVACY_DATA_GOVERNANCE.principles.retentionGovernance).toBe(true);
  });
  it("defines the Step 12 release certificate", () => {
    expect(KWAKOKO_PRIVACY_DATA_GOVERNANCE.certification.certificate).toBe("KWAKOKO-PRIVACY-DATA-CERTIFICATE-v1.0");
    expect(KWAKOKO_PRIVACY_DATA_GOVERNANCE.certification.failClosed).toBe(true);
  });
});
