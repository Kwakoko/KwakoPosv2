import { describe, it, expect, beforeEach } from "vitest";
import { ComplianceEngine } from "@kwakopos2/domain";

describe("Phase 43 — KwakoPos Compliance OS (KCAOL v1.0.0)", () => {
  let engine: ComplianceEngine;

  beforeEach(() => {
    engine = new ComplianceEngine();
  });

  it("should evaluate compliance rules and maintain valid audit hash chain", () => {
    const r = engine.evaluateRule({
      ruleId: "R-T1", tenantId: "TEN-01", framework: "GDPR",
      ruleName: "Right to Erasure Compliance", description: "Customer PII deletion workflow active",
      status: "COMPLIANT",
    });
    expect(r.success).toBe(true);

    engine.appendAuditRecord("TEN-01", "CRM", "DELETE_PII", "USR-01", "CUST-99");
    engine.appendAuditRecord("TEN-01", "CRM", "VERIFY_DELETION", "USR-01", "CUST-99");

    expect(engine.verifyAuditChain("TEN-01")).toBe(true);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.auditLogChainVerified).toBe(true);
  });
});
