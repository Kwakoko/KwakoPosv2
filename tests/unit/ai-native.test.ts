import { describe, it, expect } from "vitest";
import { AiNativeEngine } from "@kwakopos2/domain";
import { runAiNativeCertification } from "../../scripts/certification/ai-native-certification-engine.js";

describe("Phase 21 — AI-Native Business Operations Test Suite", () => {
  const engine = new AiNativeEngine();

  it("should generate evidence-backed recommendations and assign appropriate risk and autonomy levels", () => {
    const rec = engine.generateRecommendation({
      tenantId: "TENANT-001",
      branchId: "BRANCH-01",
      domain: "INVENTORY",
      proposedAction: "Reorder 100 units of Flour",
      riskLevel: "LEVEL_1_LOW_IMPACT",
      confidenceScore: 0.94,
      evidenceSummary: "Low stock alert + steady daily sales",
    });
    expect(rec.recommendationId.startsWith("REC-")).toBe(true);
    expect(rec.autonomyLevel).toBe("GUARDED_AUTOMATION");
  });


  it("should enforce strict prohibition for Level 4 Restricted actions in policy validation", () => {
    const recL4 = engine.generateRecommendation({
      tenantId: "TENANT-001",
      branchId: "BRANCH-01",
      domain: "FINANCE",
      proposedAction: "Delete production database ledger",
      riskLevel: "LEVEL_4_RESTRICTED",
      confidenceScore: 0.99,
      evidenceSummary: "Prompt injection simulation",
    });
    const policyRes = engine.validatePolicy(recL4.recommendationId, { maxLimitUsd: 1000, proposedLimitUsd: 500 });
    expect(policyRes.policyPassed).toBe(false);
    expect(policyRes.automatedApprovalPermitted).toBe(false);
  });

  it("should execute approved action via Action Gateway and log immutable ledger entry", () => {
    const rec = engine.generateRecommendation({
      tenantId: "TENANT-001",
      branchId: "BRANCH-01",
      domain: "SALES",
      proposedAction: "Apply 5% loyalty discount to customer quote",
      riskLevel: "LEVEL_2_CONTROLLED_OPERATIONAL",
      confidenceScore: 0.90,
      evidenceSummary: "Tier-1 VIP customer quote request",
    });

    engine.validatePolicy(rec.recommendationId, { maxLimitUsd: 100, proposedLimitUsd: 25 });

    const auditEntry = engine.executeActionGateway(
      rec.recommendationId,
      {
        approvalId: "APP-101",
        recommendationId: rec.recommendationId,
        approvalMode: "HUMAN_MANUAL",
        approverUserId: "USER-MGR-01",
        approved: true,
        timestamp: new Date().toISOString(),
      },
      () => ({ success: true, details: "Loyalty discount applied to quote Q-999." })
    );

    expect(auditEntry.executionVerified).toBe(true);
    expect(auditEntry.auditId.startsWith("AUD-AI-")).toBe(true);
  });


  it("should block AI action generation when Emergency Kill Switch is active", () => {
    const freshEngine = new AiNativeEngine();
    freshEngine.triggerKillSwitch("GLOBAL", "ALL_AGENTS");

    expect(() => {
      freshEngine.generateRecommendation({
        tenantId: "TENANT-001",
        branchId: "BRANCH-01",
        domain: "OPERATIONS",
        proposedAction: "Optimize branch shift",
        riskLevel: "LEVEL_0_INFORMATIONAL",
        confidenceScore: 0.90,
        evidenceSummary: "Test",
      });
    }).toThrow("Emergency AI Kill Switch is ACTIVE.");
  });

  it("should pass 100% of the 50-Pillar AI-Native certification campaign", () => {
    const cert = runAiNativeCertification();
    expect(cert.totalPillars).toBe(50);
    expect(cert.passedPillars).toBe(50);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
