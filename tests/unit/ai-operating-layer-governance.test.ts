import { describe, it, expect } from "vitest";
import { AI_OPERATING_LAYER_GOVERNANCE } from "@kwakopos2/config";
import { AiNativeEngine } from "@kwakopos2/domain";

describe("Step 21 — AI Operating Layer Governance", () => {
  it("defines fail-closed autonomy and restricted-action policy", () => {
    expect(AI_OPERATING_LAYER_GOVERNANCE.autonomy.restricted).toBe("PROHIBITED");
    expect(AI_OPERATING_LAYER_GOVERNANCE.requiredControls.humanApprovalForHighImpact).toBe(true);
    expect(AI_OPERATING_LAYER_GOVERNANCE.requiredControls.killSwitch).toBe(true);
  });

  it("blocks restricted actions through the existing AI policy engine", () => {
    const engine = new AiNativeEngine();
    const rec = engine.generateRecommendation({
      tenantId: "TEN-21", branchId: "BR-01", domain: "OPERATIONS",
      proposedAction: "DELETE_TENANT_DATA", riskLevel: "LEVEL_4_RESTRICTED",
      confidenceScore: 0.99, evidenceSummary: "Controlled governance test",
    });
    expect(rec.autonomyLevel).toBe("PROHIBITED");
    expect(rec.approvalStatus).toBe("REJECTED");
  });

  it("preserves tenant and branch attribution in recommendations", () => {
    const engine = new AiNativeEngine();
    const rec = engine.generateRecommendation({
      tenantId: "TEN-21", branchId: "BR-07", domain: "INVENTORY",
      proposedAction: "REORDER", riskLevel: "LEVEL_2_CONTROLLED_OPERATIONAL",
      confidenceScore: 0.9, evidenceSummary: "StockLedger evidence",
    });
    expect(rec.tenantId).toBe("TEN-21");
    expect(rec.branchId).toBe("BR-07");
  });

  it("exposes auditable cost and kill-switch controls", () => {
    const engine = new AiNativeEngine();
    const quota = engine.trackCostAndQuota("TEN-21", 1_100_000, 55);
    expect(quota.isThrottled).toBe(true);
    expect(engine.triggerKillSwitch("TENANT", "TEN-21").isActive).toBe(true);
  });

  it("defines evidence classes and prohibited cross-tenant capabilities", () => {
    expect(AI_OPERATING_LAYER_GOVERNANCE.evidenceClasses).toContain("PREDICTED");
    expect(AI_OPERATING_LAYER_GOVERNANCE.prohibited).toContain("CROSS_TENANT_ADMIN");
    expect(AI_OPERATING_LAYER_GOVERNANCE.prohibited).toContain("RAW_DB_BYPASS");
  });

  it("provides a stable certificate contract", () => {
    expect(AI_OPERATING_LAYER_GOVERNANCE.certificateId).toBe("KWAKOKO-AI-OPERATING-LAYER-CERTIFICATE-v1.0");
  });
});
